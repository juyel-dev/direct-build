/**
 * Canonical, dependency-free constants and pure functions shared between
 * the client (imported normally via the @/shared alias) and the
 * aurora-worker Edge Function (raw-text-injected into its deploy bundle
 * as _shared.ts by src/lib/edge-functions.ts, then imported via a real
 * relative import from index.ts).
 *
 * This file exists specifically to close a root-cause pattern found
 * across several unrelated bugs: because the client (Vite) and the
 * worker (Deno, deployed as a raw-text bundle) previously had no way to
 * share code, values that needed to agree with each other were
 * independently redefined in both places and silently drifted apart
 * (see: the content_briefs status enum disagreeing across the DB
 * constraint/Zod validator/TS type/worker; the circuit breaker's
 * threshold and cooldown being redefined separately in
 * SystemEventRepository.isCircuitOpen(); and token-expiry.test.ts
 * testing a re-implemented copy of the worker's own logic instead of
 * the real thing).
 *
 * Keep this file free of any framework or runtime-specific imports
 * (no React, no Supabase client, no Deno-specific globals) so it stays
 * safely importable from both the Vite client bundle and the Deno
 * Edge Function runtime, unmodified.
 */

/** The full, canonical set of valid content_briefs.status values. Keep
 * this in sync with the CHECK constraint in src/lib/migrations.ts
 * (currently defined in migration 1, widened by migration 17). */
export const BRIEF_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "skipped",
  "failed",
] as const;

export type BriefStatusShared = (typeof BRIEF_STATUSES)[number];

/** Circuit breaker tuning: how many recorded failures for a provider
 * within the cooldown window trips the breaker. Used by both the
 * worker (aurora-worker/index.ts: isProviderAvailable/recordProviderFailure)
 * and the client (SystemEventRepository.isCircuitOpen), which must agree
 * for the client's health/status display to reflect the worker's actual
 * behavior. */
export const CIRCUIT_THRESHOLD = 3;
export const CIRCUIT_COOLDOWN_MS = 300_000;

/** Facebook Graph API error code 190 = OAuthException (invalid/expired
 * token). This is the single source of truth for "is this Facebook
 * error a token-expiry situation" -- previously duplicated inline in
 * the worker and, separately, re-implemented inside a test file. */
export function isFacebookTokenErrorCode(code: number | undefined | null): boolean {
  return code === 190;
}

/** A job failure is terminal (goes to dead_letter rather than being
 * retried) if it's a token-expiry failure (retrying with a known-bad
 * token wastes cycles and can never succeed) or if it has exhausted its
 * retry budget. Mirrors the exact logic in aurora-worker/index.ts's
 * processJob catch block. */
export function isTerminalJobFailure(
  errorDetail: string,
  attempts: number,
  maxAttempts: number,
): boolean {
  return errorDetail.startsWith("TOKEN_EXPIRED:") || attempts >= maxAttempts;
}

/** Default Facebook Graph API version. Was previously hardcoded
 * independently in 5 separate places (the worker's own _core.ts plus
 * four client-side call sites in test-connections.ts/setup-runner.ts)
 * -- the worker reads FBAI_GRAPH_VERSION as an env override of this
 * default; client call sites use this constant directly, since they
 * don't need runtime configurability the same way. */
export const DEFAULT_GRAPH_VERSION = "v21.0";
