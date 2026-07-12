import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRIEF_STATUSES } from "../../shared/aurora-shared";

/**
 * This test reads the worker's actual deployed source as plain text
 * (Vitest runs in Node, so this works even though the file itself is
 * Deno code that can't be imported directly) and checks that every
 * status literal it writes to content_briefs is a member of the shared
 * canonical status list.
 *
 * This is deliberately a lightweight heuristic (a line-proximity scan),
 * not a full TypeScript/SQL parser -- it exists specifically to catch
 * the exact class of bug found in this audit: the worker writing a
 * status value ('publishing') that no other part of the system (the DB
 * constraint, the Zod validator, the TS type) considered valid. A
 * heuristic that would have caught that specific, real bug is worth
 * far more here than a more "complete" parser that doesn't get written
 * because it's too much effort.
 */
describe("worker content_briefs status values match the shared canonical list", () => {
  const workerSource = readFileSync(
    resolve(__dirname, "../../../supabase/functions/aurora-worker/index.ts"),
    "utf8",
  );

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
