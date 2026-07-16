import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { BRIEF_STATUSES } from "../../shared/aurora-shared";

/**
 * This test reads every source file in the aurora-worker Edge Function
 * directory as plain text (Vitest runs in Node, so this works even
 * though the files are Deno code that can't be imported directly) and
 * checks that every status literal written to content_briefs is a
 * member of the shared canonical status list.
 *
 * Scans the whole directory rather than just index.ts because the
 * worker is modularized across several files (_core.ts, _publishing.ts,
 * etc.) — the actual status-writing code (claimBriefForPublish) lives
 * in _publishing.ts, not index.ts. Scanning only the entry point would
 * make this test vacuously pass regardless of what the other files do,
 * silently losing the exact protection it exists to provide.
 *
 * This is deliberately a lightweight heuristic (a line-proximity scan),
 * not a full TypeScript/SQL parser -- it exists specifically to catch
 * the exact class of bug found in this audit: the worker writing a
 * status value ('publishing') that no other part of the system (the DB
 * constraint, the Zod validator, the TS type) considered valid.
 */
describe("worker content_briefs status values match the shared canonical list", () => {
  const workerDir = resolve(__dirname, "../../../supabase/functions/aurora-worker");
  const workerSource = readdirSync(workerDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => readFileSync(join(workerDir, f), "utf8"))
    .join("\n");

  it("finds at least one content_briefs status write (sanity check that this test isn't vacuous)", () => {
    const briefBlocks = workerSource.split(/\.from\("content_briefs"\)/g).slice(1);
    const statusesFound = briefBlocks
      .flatMap((block) => [...block.slice(0, 300).matchAll(/status:\s*"([a-z_]+)"/g)])
      .map((m) => m[1]);
    expect(statusesFound.length).toBeGreaterThan(0);
  });

  it("only ever writes status values that exist in BRIEF_STATUSES", () => {
    const briefBlocks = workerSource.split(/\.from\("content_briefs"\)/g).slice(1);
    const statusesFound = new Set(
      briefBlocks
        .flatMap((block) => [...block.slice(0, 300).matchAll(/status:\s*"([a-z_]+)"/g)])
        .map((m) => m[1]),
    );
    for (const status of statusesFound) {
      expect(BRIEF_STATUSES as readonly string[]).toContain(status);
    }
  });
});
