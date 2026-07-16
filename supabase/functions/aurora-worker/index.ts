import {
  type Json,
  type Page,
  type Brief,
  type Job,
  GRAPH_VERSION,
  WORKER_NAME,
  corsHeaders,
  requiredEnv,
  supabase,
  CRON_SECRET,
  AI_API_KEY,
  LLM_PROVIDER,
  LLM_MODEL,
  LLM_BASE_URL,
  FALLBACK_LLM_MODEL,
  PAGE_TOKEN,
  PROMPT_VERSION,
  STRATEGY_VERSION,
  WORKER_TIMEOUT_MS,
  log,
  fetchWithTimeout,
  runWithTimeout,
  messageOf,
  json,
  event,
  loadActivePages,
  defaultLlmBaseUrl,
  loadInsights,
  loadBrandMemory,
  loadPostHistoryWithEngagement,
  type PostWithEngagement,
  type BrandMemoryRow,
  computeQualityFeedback,
} from "./_core.ts";
import {
  heartbeat,
  isProviderAvailable,
  recordProviderFailure,
  HEARTBEAT_INTERVAL_MS,
} from "./_lifecycle.ts";
import { isFacebookTokenErrorCode, isTerminalJobFailure } from "./_shared.ts";
import { extractLlmUsage, logUsage } from "./_ai-usage.ts";
import { cleanupImages, captureEngagement, aggregateDailyAnalytics, cleanupOldSnapshots } from "./_analytics.ts";
import { extractBrandMemory, analyzeBrandLlm } from "./_brand-memory.ts";
import { planContent } from "./_content-generation.ts";
import { publishDuePosts } from "./_publishing.ts";

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


async function computeStrategy(page: Page, windowDays: number) {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select(
      "published_at, content_brief_id, engagement_snapshots(likes, comments, shares, impressions), content_briefs(topic)",
    )
    .eq("page_id", page.id)
    .eq("status", "published")
    .gte("published_at", since);
  if (error) throw error;

  const hourScores = new Map<number, number>();
  const topicScores = new Map<string, number>();
  let totalEngagement = 0;
  let totalImpressions = 0;

  for (const post of data ?? []) {
    const snapshots = Array.isArray(post.engagement_snapshots) ? post.engagement_snapshots : [];
    const latest = snapshots[snapshots.length - 1] ?? {
      likes: 0,
      comments: 0,
      shares: 0,
      impressions: 0,
    };
    const score =
      Number(latest.likes ?? 0) + Number(latest.comments ?? 0) * 2 + Number(latest.shares ?? 0) * 3;
    const hour = post.published_at ? new Date(post.published_at).getUTCHours() : 0;
    hourScores.set(hour, (hourScores.get(hour) ?? 0) + score);
    const topic = String(post.content_briefs?.topic ?? "").trim();
    if (topic) topicScores.set(topic, (topicScores.get(topic) ?? 0) + score);
    totalEngagement += score;
    totalImpressions += Number(latest.impressions ?? 0);
  }

  const bestHour = topEntry(hourScores)?.[0] ?? null;
  const bestTopics = Array.from(topicScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);
  const avgEngagementRate = totalImpressions > 0 ? totalEngagement / totalImpressions : null;
  const { error: upsertError } = await supabase.from("strategy_insights").upsert({
    page_id: page.id,
    window_days: windowDays,
    best_posting_hour: bestHour,
    best_topics: bestTopics,
    avg_engagement_rate: avgEngagementRate,
    computed_at: new Date().toISOString(),
  });
  if (upsertError) throw upsertError;
  return `Updated strategy insights from ${data?.length ?? 0} posts.`;
}

// src/types/index.ts:142 (StrategyRecommendation)
type StrategyRec = {
  recommendation_type: string;
  recommendation_text: string;
  reasoning: string;
  priority: number;
  related_content: Array<{ type: string; text: string }>;
};

function normalizeStrategyRecs(raw: unknown[]): StrategyRec[] {
  return raw.filter((r): r is StrategyRec =>
    r != null &&
    typeof (r as Record<string, unknown>).recommendation_type === "string" &&
    typeof (r as Record<string, unknown>).recommendation_text === "string"
  ).map((r) => ({
    recommendation_type: (r as Record<string, unknown>).recommendation_type as string,
    recommendation_text: (r as Record<string, unknown>).recommendation_text as string,
    reasoning: typeof (r as Record<string, unknown>).reasoning === "string" ? (r as Record<string, unknown>).reasoning as string : "",
    priority: typeof (r as Record<string, unknown>).priority === "number" ? (r as Record<string, unknown>).priority as number : 0,
    related_content: Array.isArray((r as Record<string, unknown>).related_content) ? (r as Record<string, unknown>).related_content as Array<{ type: string; text: string }> : [],
  }));
}

// Mirrors src/services/strategy.service.ts buildAnalysisPrompt
// Keep both copies in sync when making prompt/logic changes
function buildStrategyPrompt(
  memory: BrandMemoryRow | null,
  insights: Record<string, unknown>,
  posts: PostWithEngagement[],
): string {
  const scoredPosts = posts
    .map((p) => {
      const snaps = p.engagement_snapshots ?? [];
      const latest = snaps[snaps.length - 1] ?? {};
      return {
        topic: p.content_briefs?.topic ?? "",
        caption: (p.content_briefs?.caption ?? "").slice(0, 200),
        likes: Number(latest.likes ?? 0),
        comments: Number(latest.comments ?? 0),
        shares: Number(latest.shares ?? 0),
        score: Number(latest.likes ?? 0) + Number(latest.comments ?? 0) * 2 + Number(latest.shares ?? 0) * 3,
        published_at: p.published_at,
      };
    })
    .sort((a, b) => b.score - a.score);

  const topPosts = scoredPosts.slice(0, 10);
  const bottomPosts = scoredPosts.filter((p) => p.score > 0).slice(-5);
  const totalEngagement = scoredPosts.reduce((a, p) => a + p.score, 0);
  const avgScore = scoredPosts.length ? Math.round(totalEngagement / scoredPosts.length) : 0;

  const brandContext = memory
    ? [
        memory.brand_descriptors?.length ? `Brand identity: ${memory.brand_descriptors.join(", ")}.` : "",
        memory.writing_style_notes ? `Style: ${memory.writing_style_notes}.` : "",
        memory.tone_guidelines ? `Tone: ${memory.tone_guidelines}.` : "",
        memory.effective_hashtags?.length ? `Top hashtags: ${memory.effective_hashtags.join(", ")}.` : "",
        memory.avoided_topics?.length ? `Avoid: ${memory.avoided_topics.join(", ")}.` : "",
      ].filter(Boolean).join(" ")
    : "No brand memory yet.";

  const qualityFeedback = computeQualityFeedback(posts);
  const qfLines = qualityFeedback ? qualityFeedback.split("\n") : [];

  return JSON.stringify({
    task: "Analyze this Facebook page's content performance and generate 3-5 strategic recommendations.",
    brand: brandContext,
    strategy_insights: {
      best_posting_hour: insights.best_posting_hour ?? null,
      best_topics: insights.best_topics ?? [],
      avg_engagement_rate: insights.avg_engagement_rate ?? null,
      average_post_score: avgScore,
    },
    quality_feedback: qfLines.length ? qfLines : undefined,
    top_performing_posts: topPosts.map((p) => ({
      topic: p.topic, caption: p.caption, likes: p.likes, comments: p.comments, shares: p.shares, score: p.score,
    })),
    underperforming_posts: bottomPosts.map((p) => ({
      topic: p.topic, caption: p.caption, score: p.score,
    })),
    requirements: [
      "Return ONLY valid JSON. No markdown, no code fences.",
      'Format: {"recommendations":[{"recommendation_type":"topic|hook|timing|brand_voice|content_angle","recommendation_text":"clear actionable suggestion","reasoning":"why this helps the page grow","priority":1-10,"related_content":[{"type":"example","text":"supporting detail"}]}]}',
      "recommendation_type must be one of: topic, hook, timing, brand_voice, content_angle",
      "Priority 10 = most important. Priority 1 = nice to have.",
      "Base suggestions on actual data from top and underperforming posts.",
      "If brand memory exists, ensure suggestions align with brand identity, tone, and style.",
      "If brand memory is empty, suggest setting up brand descriptors.",
    ],
  });
}

async function callLlmForStrategy(
  prompt: string,
  baseUrl: string,
  apiKey: string,
  model: string,
  pageId: string,
): Promise<StrategyRec[]> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    timeout: 45_000,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a Facebook content strategy analyst. Return ONLY valid JSON. No markdown, no code fences." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });
  const body = await response.text();
  const usage = extractLlmUsage(body);
  await logUsage(pageId, null, LLM_PROVIDER, model, usage);
  if (!response.ok) {
    await recordProviderFailure("llm", `Strategy LLM ${response.status}: ${body.slice(0, 240)}`);
    throw new Error(`Strategy LLM call failed (${response.status}): ${body.slice(0, 240)}`);
  }
  let parsed: { data?: { choices?: { message?: { content?: string } }[] } };
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Strategy LLM returned non-JSON response");
  }
  const content = parsed?.choices?.[0]?.message?.content ?? "{}";
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content);
  } catch {
    throw new Error("Strategy LLM returned invalid JSON in message content");
  }
  if (!Array.isArray(data.recommendations)) {
    throw new Error("Strategy LLM response missing recommendations array");
  }
  const valid = normalizeStrategyRecs(data.recommendations);
  if (valid.length === 0) {
    throw new Error("Strategy LLM returned zero valid recommendations");
  }
  return valid;
}

// Mirrors src/services/strategy.service.ts computeDeterministicRecs
function computeDeterministicRecs(
  memory: BrandMemoryRow | null,
  insights: Record<string, unknown>,
  posts: PostWithEngagement[],
  page: Page,
): StrategyRec[] {
  const recs: StrategyRec[] = [];

  if (memory?.best_posting_days?.length) {
    recs.push({
      recommendation_type: "deterministic_timing",
      recommendation_text: `Your best posting days are ${memory.best_posting_days.join(", ")}. Schedule your most important content on these days.`,
      reasoning: `Analysis of ${posts.length} posts shows highest engagement on ${memory.best_posting_days.join(", ")}.`,
      priority: 7,
    });
  }

  if (memory?.cta_frequency && memory.cta_frequency === "rare") {
    recs.push({
      recommendation_type: "deterministic_content",
      recommendation_text: "Fewer than 10% of your posts include a call-to-action. Adding CTAs like 'Click the link' or 'Share your thoughts' can boost engagement.",
      reasoning: `CTA frequency is ${memory.cta_frequency} across ${posts.length} analyzed posts.`,
      priority: 8,
    });
  } else if (memory?.cta_frequency && memory.cta_frequency === "occasional") {
    recs.push({
      recommendation_type: "deterministic_content",
      recommendation_text: "About a quarter of your posts include a call-to-action. Try increasing CTAs to drive more clicks and comments.",
      reasoning: `CTA frequency is ${memory.cta_frequency}.`,
      priority: 5,
    });
  }

  if (memory?.media_usage_ratio != null && memory.media_usage_ratio < 0.5) {
    recs.push({
      recommendation_type: "deterministic_content",
      recommendation_text: `Only ${Math.round(memory.media_usage_ratio * 100)}% of your posts include images. Photo posts typically get significantly more engagement than text-only posts.`,
      reasoning: `Media usage ratio is ${memory.media_usage_ratio}.`,
      priority: 7,
    });
  }

  if (memory?.hashtag_count_avg != null && memory.hashtag_count_avg < 1) {
    recs.push({
      recommendation_type: "deterministic_hashtag",
      recommendation_text: "Your posts use very few hashtags. Adding 3-5 relevant hashtags can increase discoverability.",
      reasoning: `Average hashtag count is ${memory.hashtag_count_avg}.`,
      priority: 4,
    });
  }

  if (memory?.effective_hashtags?.length) {
    recs.push({
      recommendation_type: "deterministic_hashtag",
      recommendation_text: `Your top-performing hashtags are: ${memory.effective_hashtags.slice(0, 5).join(", ")}. Use these consistently.`,
      reasoning: "Based on engagement correlation with hashtag usage across your posts.",
      priority: 5,
    });
  }

  const bestHour = (insights.best_posting_hour as number | null) ?? null;
  if (bestHour != null) {
    const hourStr = bestHour > 12 ? `${bestHour - 12}pm` : bestHour === 12 ? "12pm" : `${bestHour}am`;
    recs.push({
      recommendation_type: "deterministic_timing",
      recommendation_text: `Your best posting time is around ${hourStr}. Schedule posts near this hour for maximum reach.`,
      reasoning: `Peak engagement hour identified from ${posts.length} posts.`,
      priority: 6,
    });
  }

  return recs;
}

async function generateStrategy(page: Page) {
  if (!AI_API_KEY) return "Skipped — no AI API key configured.";
  if (!await isProviderAvailable("llm")) return "Skipped — LLM provider in cooldown.";

  const [memory, insights, posts] = await Promise.all([
    loadBrandMemory(page.id),
    loadInsights(page.id),
    loadPostHistoryWithEngagement(page.id, 90),
  ]);

  const prompt = buildStrategyPrompt(memory, insights, posts);
  const baseUrl = LLM_BASE_URL || defaultLlmBaseUrl(LLM_PROVIDER);
  if (!baseUrl) return "Skipped — no LLM base URL configured.";

  let aiRecommendations: StrategyRec[];
  try {
    aiRecommendations = await callLlmForStrategy(prompt, baseUrl, AI_API_KEY, LLM_MODEL, page.id);
  } catch (error) {
    log("warn", "Strategy LLM primary model failed, checking fallback", {
      model: LLM_MODEL, error: messageOf(error),
    });
    if (!FALLBACK_LLM_MODEL) throw error;
    aiRecommendations = await callLlmForStrategy(prompt, baseUrl, AI_API_KEY, FALLBACK_LLM_MODEL, page.id);
  }

  const deterministicRecs = computeDeterministicRecs(memory, insights, posts, page);
  const allRecs = [...aiRecommendations, ...deterministicRecs];

  const { error: rpcError } = await supabase.rpc("replace_strategy_recommendations", {
    _page_id: page.id,
    _recommendations: JSON.stringify(allRecs.map((r) => ({
      recommendation_type: r.recommendation_type,
      recommendation_text: r.recommendation_text,
      reasoning: r.reasoning,
      priority: r.priority,
      related_content: r.related_content ?? [],
    }))),
    _prompt_version: PROMPT_VERSION,
    _strategy_version: STRATEGY_VERSION,
  });
  if (rpcError) throw rpcError;

  return `Generated ${aiRecommendations.length} AI + ${deterministicRecs.length} deterministic recommendations.`;
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

function topEntry<T>(scores: Map<T, number>) {
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
}
