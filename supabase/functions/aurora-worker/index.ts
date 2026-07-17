import {
  type Json,
  type Page,
  type Brief,
  type Job,
  WORKER_NAME,
  corsHeaders,
  supabase,
  CRON_SECRET,
  PAGE_TOKEN,
  WORKER_TIMEOUT_MS,
  log,
  fetchWithTimeout,
  runWithTimeout,
  messageOf,
  json,
  event,
  loadActivePages,
} from "./_core.ts";
import {
  heartbeat,
  isProviderAvailable,
  recordProviderFailure,
  HEARTBEAT_INTERVAL_MS,
} from "./_lifecycle.ts";
import { isFacebookTokenErrorCode, isTerminalJobFailure } from "./_shared.ts";
import {
  cleanupImages,
  captureEngagement,
  aggregateDailyAnalytics,
  cleanupOldSnapshots,
} from "./_analytics.ts";
import { extractBrandMemory, analyzeBrandLlm } from "./_brand-memory.ts";
import { planContent } from "./_content-generation.ts";
import { publishDuePosts } from "./_publishing.ts";
import { computeStrategy, generateStrategy } from "./_strategy.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin" } });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  // Auth uses a shared secret (FBAI_CRON_SECRET) set at deploy time because
  // this worker is invoked by Supabase pg_cron, which sends the secret as
  // x-automation-secret header. No JWT/user auth exists in the current BYOB
  // single-user model. If multi-tenant auth is added later, replace this with
  // proper JWT verification tied to the caller's session.
  const suppliedSecret = request.headers.get("x-automation-secret");
  if (CRON_SECRET && suppliedSecret !== CRON_SECRET) {
    return json({ error: "Invalid automation secret." }, 401);
  }

  const startedAt = Date.now();
  log("info", "Worker invocation started");
  try {
    const result = await runWithTimeout(async () => {
      const pages = await loadActivePages();
      if (pages.length === 0) {
        log("info", "Idle — no active pages");
        return [];
      }
      await seedRecurringJobs(pages);
      const jobs = await claimJobs();
      if (jobs.length === 0) {
        log("info", "Idle — no pending jobs");
        return [];
      }
      const results = [];
      for (const job of jobs) {
        results.push(await processJob(job, pages));
      }
      return results;
    }, WORKER_TIMEOUT_MS);
    const elapsed = Date.now() - startedAt;
    log("info", "Worker invocation completed", { claimed: result.length, elapsed_ms: elapsed });
    return json({
      ok: true,
      claimed: result.length,
      results: result,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    const msg = messageOf(error);
    log("error", "Worker invocation failed", { error: msg });
    await event("error", "worker", msg, { stack: error instanceof Error ? error.stack : null });
    return json({ error: msg }, 500);
  }
});

/* ─── Job processing ────────────────────────────────────────── */

async function seedRecurringJobs(pages: Page[]) {
  const now = new Date();
  for (const page of pages) {
    await enqueue(page.id, "plan_content", floorBucket(now, 6 * 60), { horizon_days: 7 }, 5);
    await enqueue(page.id, "publish_due_posts", floorBucket(now, 1), {}, 10);
    await enqueue(page.id, "capture_engagement", floorBucket(now, 60), { window_days: 30 }, 0);
    await enqueue(page.id, "compute_strategy", floorBucket(now, 6 * 60), { window_days: 30 }, 0);
    await enqueue(page.id, "extract_brand_memory", floorBucket(now, 24 * 60), {}, 0);
    await enqueue(page.id, "analyze_brand_llm", floorBucket(now, 24 * 60), {}, 0);
    await enqueue(page.id, "cleanup_images", floorBucket(now, 24 * 60), {}, 0);
    await enqueue(page.id, "aggregate_analytics", floorBucket(now, 24 * 60), {}, 0);
    await enqueue(page.id, "generate_strategy", floorBucket(now, 6 * 60), {}, 0);
  }
}

async function enqueue(
  pageId: string,
  kind: string,
  bucket: string,
  payload: Json,
  priority: number,
) {
  const { error } = await supabase.from("jobs").upsert(
    {
      page_id: pageId,
      kind,
      payload,
      priority,
      scheduled_at: new Date().toISOString(),
      idempotency_key: `${kind}:${pageId}:${bucket}`,
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (error) {
    log("error", "Enqueue failed", { kind, page_id: pageId, error: messageOf(error) });
    throw error;
  }
}

async function claimJobs(): Promise<Job[]> {
  const { data, error } = await supabase.rpc("claim_jobs", { _limit: 10, _worker: WORKER_NAME });
  if (error) throw error;
  const jobs = (data ?? []) as Job[];
  if (jobs.length > 0) log("info", "Jobs claimed", { count: jobs.length });
  return jobs;
}

async function processJob(job: Job, pages: Page[]) {
  const page = pages.find((item) => item.id === job.page_id);
  if (!page) {
    await completeJob(job, "succeeded", "Page is no longer active.");
    return { id: job.id, kind: job.kind, ok: true, skipped: true };
  }

  log("info", "Processing job", { job_id: job.id, kind: job.kind, page_id: page.id });

  const heartbeatTimer = setInterval(() => {
    heartbeat(job.id).catch((e) => log("warn", "Heartbeat error", { error: messageOf(e) }));
  }, HEARTBEAT_INTERVAL_MS);

  try {
    let detail = "";
    if (job.kind === "plan_content")
      detail = await planContent(page, Number(job.payload.horizon_days ?? 7));
    else if (job.kind === "publish_due_posts") detail = await publishDuePosts(page);
    else if (job.kind === "capture_engagement")
      detail = await captureEngagement(page, Number(job.payload.window_days ?? 30));
    else if (job.kind === "compute_strategy")
      detail = await computeStrategy(page, Number(job.payload.window_days ?? 30));
    else if (job.kind === "extract_brand_memory")
      detail = await extractBrandMemory(page);
    else if (job.kind === "analyze_brand_llm")
      detail = await analyzeBrandLlm(page);
    else if (job.kind === "cleanup_images")
      detail = await cleanupImages(page);
    else if (job.kind === "aggregate_analytics") {
      await aggregateDailyAnalytics(page);
      detail = await cleanupOldSnapshots(page);
    } else if (job.kind === "generate_strategy")
      detail = await generateStrategy(page);
    else detail = `Unknown job kind "${job.kind}" skipped.`;
    clearInterval(heartbeatTimer);
    await completeJob(job, "succeeded", detail);
    log("info", "Job completed", { job_id: job.id, kind: job.kind, detail });
    return { id: job.id, kind: job.kind, ok: true, detail };
  } catch (error) {
    clearInterval(heartbeatTimer);
    const detail = messageOf(error);
    const isTokenExpired = detail.startsWith("TOKEN_EXPIRED:");
    const terminal = isTerminalJobFailure(detail, job.attempts, job.max_attempts);
    await completeJob(job, terminal ? "dead_letter" : "failed_retryable", detail);
    log("warn", terminal ? "Job failed terminal" : "Job failed retryable", {
      job_id: job.id, kind: job.kind, attempts: job.attempts, error: detail, token_expired: isTokenExpired,
    });
    return { id: job.id, kind: job.kind, ok: false, error: detail };
  }
}


async function completeJob(job: Job, status: string, detail: string) {
  const retryAt =
    status === "failed_retryable"
      ? new Date(Date.now() + Math.min(60, 2 ** Math.max(0, job.attempts)) * 60_000).toISOString()
      : null;
  const now = new Date().toISOString();
  const isTerminal = status === "succeeded" || status === "dead_letter";
  const { error } = await supabase
    .from("jobs")
    .update({
      status,
      last_error: status === "succeeded" ? null : detail,
      next_retry_at: retryAt,
      lease_expires_at: null,
      completed_at: isTerminal ? now : null,
      updated_at: now,
    })
    .eq("id", job.id);
  if (error) throw error;
  if (status === "dead_letter") {
    await event("error", "dead_letter", `${job.kind} moved to dead letter queue: ${detail}`, {
      job_id: job.id, kind: job.kind, attempts: job.attempts,
    });
  }
  await event(status === "succeeded" ? "info" : "error", "job", `${job.kind}: ${detail}`, {
    job_id: job.id,
  });
}


function floorBucket(date: Date, minutes: number) {
  const ms = minutes * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms).toISOString();
}
