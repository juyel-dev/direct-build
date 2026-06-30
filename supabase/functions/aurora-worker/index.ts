import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

type Json = Record<string, unknown>;

type Page = {
  id: string;
  fb_page_id: string | null;
  fb_page_name: string;
  default_brand_voice: string | null;
  default_posting_windows: { hour: number; minute: number }[] | null;
  posting_mode: "manual" | "hybrid" | "full_auto";
  max_posts_per_day: number;
  prompt_overrides: Json | null;
};

type Brief = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string | null;
  caption: string | null;
  hashtags: string[] | null;
  image_prompt: string | null;
  image_url: string | null;
  status: string;
};

type Job = {
  id: string;
  page_id: string | null;
  kind: string;
  payload: Json;
  attempts: number;
  max_attempts: number;
};

const GRAPH_VERSION = "v21.0";
const WORKER_NAME = "aurora-worker";

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
) {
  const { timeout = 30_000, ...fetchOpts } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-automation-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = requiredEnv("FBAI_SUPABASE_URL", "SUPABASE_URL");
const serviceKey = requiredEnv("FBAI_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST." }, 405);

  const expectedSecret = Deno.env.get("FBAI_CRON_SECRET");
  const suppliedSecret = request.headers.get("x-automation-secret");
  if (expectedSecret && suppliedSecret !== expectedSecret) {
    return json({ error: "Invalid automation secret." }, 401);
  }

  const startedAt = Date.now();
  try {
    const pages = await loadActivePages();
    await seedRecurringJobs(pages);
    const jobs = await claimJobs();
    const results = [];
    for (const job of jobs) {
      results.push(await processJob(job, pages));
    }
    return json({
      ok: true,
      claimed: jobs.length,
      results,
      elapsed_ms: Date.now() - startedAt,
    });
  } catch (error) {
    await event("error", "worker", messageOf(error), {
      stack: error instanceof Error ? error.stack : null,
    });
    return json({ error: messageOf(error) }, 500);
  }
});

async function loadActivePages(): Promise<Page[]> {
  const { data, error } = await supabase
    .from("pages")
    .select(
      "id, fb_page_id, fb_page_name, default_brand_voice, default_posting_windows, posting_mode, max_posts_per_day, prompt_overrides, status",
    )
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as Page[];
}

async function seedRecurringJobs(pages: Page[]) {
  const now = new Date();
  for (const page of pages) {
    await enqueue(page.id, "plan_content", floorBucket(now, 6 * 60), { horizon_days: 7 }, 5);
    await enqueue(page.id, "publish_due_posts", floorBucket(now, 1), {}, 10);
    await enqueue(page.id, "capture_engagement", floorBucket(now, 60), { window_days: 30 }, 0);
    await enqueue(page.id, "compute_strategy", floorBucket(now, 6 * 60), { window_days: 30 }, 0);
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
  if (error) throw error;
}

async function claimJobs(): Promise<Job[]> {
  const { data, error } = await supabase.rpc("claim_jobs", { _limit: 10, _worker: WORKER_NAME });
  if (error) throw error;
  return (data ?? []) as Job[];
}

async function processJob(job: Job, pages: Page[]) {
  const page = pages.find((item) => item.id === job.page_id);
  if (!page) {
    await completeJob(job, "succeeded", "Page is no longer active.");
    return { id: job.id, kind: job.kind, ok: true, skipped: true };
  }

  try {
    let detail = "";
    if (job.kind === "plan_content")
      detail = await planContent(page, Number(job.payload.horizon_days ?? 7));
    else if (job.kind === "publish_due_posts") detail = await publishDuePosts(page);
    else if (job.kind === "capture_engagement")
      detail = await captureEngagement(page, Number(job.payload.window_days ?? 30));
    else if (job.kind === "compute_strategy")
      detail = await computeStrategy(page, Number(job.payload.window_days ?? 30));
    else detail = `Unknown job kind "${job.kind}" skipped.`;
    await completeJob(job, "succeeded", detail);
    return { id: job.id, kind: job.kind, ok: true, detail };
  } catch (error) {
    const terminal = job.attempts >= job.max_attempts;
    await completeJob(job, terminal ? "failed_terminal" : "failed_retryable", messageOf(error));
    return { id: job.id, kind: job.kind, ok: false, error: messageOf(error) };
  }
}

async function planContent(page: Page, horizonDays: number) {
  const windows = normalizedWindows(page);
  const targetSlots = upcomingSlots(windows, horizonDays, page.max_posts_per_day);
  if (targetSlots.length === 0) return "No posting windows configured.";

  const from = targetSlots[0].toISOString();
  const to = targetSlots[targetSlots.length - 1].toISOString();
  const { data: existing, error } = await supabase
    .from("content_briefs")
    .select("slot_start")
    .eq("page_id", page.id)
    .gte("slot_start", from)
    .lte("slot_start", to);
  if (error) throw error;

  const used = new Set(
    (existing ?? [])
      .map((item: { slot_start: string }) => new Date(item.slot_start).getTime())
      .filter(Number.isFinite),
  );
  const missing = targetSlots.filter((slot) => !used.has(slot.getTime()));
  if (missing.length === 0) return "Calendar already has briefs for the planning horizon.";

  const ideas = await generateBriefIdeas(page, missing);
  const status = page.posting_mode === "full_auto" ? "scheduled" : "draft";
  const rows = missing.map((slot, index) => ({
    page_id: page.id,
    slot_start: slot.toISOString(),
    topic: ideas[index]?.topic ?? fallbackTopic(page, index),
    caption: ideas[index]?.caption ?? fallbackCaption(page, index),
    hashtags: ideas[index]?.hashtags ?? fallbackHashtags(page),
    image_prompt: ideas[index]?.image_prompt ?? fallbackImagePrompt(page, index),
    image_url: ideas[index]?.image_url ?? null,
    hook: ideas[index]?.hook ?? "",
    cta: ideas[index]?.cta ?? "",
    predicted_engagement_score: ideas[index]?.predicted_engagement_score ?? null,
    status,
  }));
  const { error: insertError } = await supabase.from("content_briefs").upsert(rows, {
    onConflict: "page_id,slot_start",
    ignoreDuplicates: true,
  });
  if (insertError) throw insertError;
  return `Created ${rows.length} ${status} briefs.`;
}

async function generateBriefIdeas(page: Page, slots: Date[]) {
  const aiKey = Deno.env.get("FBAI_AI_API_KEY");
  const provider = Deno.env.get("FBAI_LLM_PROVIDER") ?? "openrouter";
  const model = Deno.env.get("FBAI_LLM_MODEL") ?? "meta-llama/llama-3.3-70b-instruct:free";
  const baseUrl = (Deno.env.get("FBAI_LLM_BASE_URL") || defaultLlmBaseUrl(provider)).replace(
    /\/+$/,
    "",
  );
  if (!aiKey || !baseUrl) return [];

  const insights = await loadInsights(page.id);
  const context = page.prompt_overrides ?? {};
  const prompt = {
    brand: page.fb_page_name,
    voice: page.default_brand_voice ?? "",
    audience: String(context.audience ?? ""),
    allowed_topics: Array.isArray(context.topics) ? context.topics : [],
    strategy: insights,
    slots: slots.map((slot) => slot.toISOString()),
  };

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    timeout: 30_000,
    headers: { "content-type": "application/json", authorization: `Bearer ${aiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            'You write Facebook content plans. Return JSON only: {"briefs":[{"topic":"","caption":"","hashtags":[""],"image_prompt":"","hook":"","cta":"","predicted_engagement_score":0.1}]} . Captions must be concise, useful, non-spammy, and under 280 characters.',
        },
        { role: "user", content: JSON.stringify(prompt) },
      ],
      response_format: { type: "json_object" },
      temperature: 0.75,
    }),
  });
  const body = await response.text();
  await logUsage(page.id, null, provider, model);
  if (!response.ok) throw new Error(`LLM ${response.status}: ${body.slice(0, 240)}`);

  const parsed = JSON.parse(extractJson(body));
  const content = parsed.choices?.[0]?.message?.content;
  const plan = typeof content === "string" ? JSON.parse(extractJson(content)) : parsed;
  const briefs = Array.isArray(plan.briefs) ? plan.briefs : [];
  return await Promise.all(
    briefs.map((brief: Json, index: number) => normalizeGeneratedBrief(page, brief, index)),
  );
}

async function normalizeGeneratedBrief(page: Page, brief: Json, index: number) {
  const imagePrompt =
    typeof brief.image_prompt === "string" ? brief.image_prompt : fallbackImagePrompt(page, index);
  return {
    topic: typeof brief.topic === "string" ? brief.topic : fallbackTopic(page, index),
    caption: typeof brief.caption === "string" ? brief.caption : fallbackCaption(page, index),
    hashtags: Array.isArray(brief.hashtags)
      ? brief.hashtags.map(String).slice(0, 8)
      : fallbackHashtags(page),
    image_prompt: imagePrompt,
    image_url: await maybeGenerateImageUrl(imagePrompt),
    hook: typeof brief.hook === "string" ? brief.hook : "",
    cta: typeof brief.cta === "string" ? brief.cta : "",
    predicted_engagement_score:
      typeof brief.predicted_engagement_score === "number"
        ? brief.predicted_engagement_score
        : null,
  };
}

async function maybeGenerateImageUrl(prompt: string): Promise<string | null> {
  const provider = Deno.env.get("FBAI_IMAGE_PROVIDER") ?? "pollinations";
  const model = Deno.env.get("FBAI_IMAGE_MODEL") ?? "flux";
  if (!prompt) return null;
  if (provider === "pollinations") {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(model)}&nologo=true`;
  }
  if (provider === "openai_dalle" && Deno.env.get("FBAI_IMAGE_API_KEY")) {
    const response = await fetchWithTimeout("https://api.openai.com/v1/images/generations", {
      method: "POST",
      timeout: 20_000,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${Deno.env.get("FBAI_IMAGE_API_KEY")}`,
      },
      body: JSON.stringify({ model, prompt, size: "1024x1024", n: 1 }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(`Image API ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
    return body.data?.[0]?.url ?? null;
  }
  return null;
}

async function publishDuePosts(page: Page) {
  if (!page.fb_page_id) return "Skipped — Facebook page id missing.";
  const token = Deno.env.get("FBAI_FB_PAGE_TOKEN");
  if (!token) return "Skipped — Facebook page token missing.";

  const { count: publishedToday, error: countError } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id)
    .eq("status", "published")
    .gte("published_at", startOfUtcDay(new Date()).toISOString());
  if (countError) throw countError;

  const remaining = Math.max(0, page.max_posts_per_day - (publishedToday ?? 0));
  if (remaining === 0) return "Daily post cap reached.";

  const allowedStatuses = page.posting_mode === "manual" ? ["approved"] : ["approved", "scheduled"];
  const { data, error } = await supabase
    .from("content_briefs")
    .select("*")
    .eq("page_id", page.id)
    .in("status", allowedStatuses)
    .lte("slot_start", new Date().toISOString())
    .order("slot_start")
    .limit(remaining);
  if (error) throw error;

  const briefs = (data ?? []) as Brief[];
  let published = 0;
  for (const brief of briefs) {
    const claimed = await claimBriefForPublish(brief.id);
    if (!claimed) continue;
    await publishBrief(page, brief, token);
    published += 1;
  }
  return `Published ${published} due posts.`;
}

async function claimBriefForPublish(briefId: string) {
  const { data, error } = await supabase
    .from("content_briefs")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .in("status", ["approved", "scheduled"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function publishBrief(page: Page, brief: Brief, token: string) {
  const caption = buildCaption(brief);
  const idempotencyKey = `fb:${brief.id}`;
  const { error: postError } = await supabase.from("posts").upsert(
    {
      page_id: page.id,
      content_brief_id: brief.id,
      idempotency_key: idempotencyKey,
      status: "pending",
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (postError) throw postError;

  const endpoint = brief.image_url
    ? `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(page.fb_page_id ?? "")}/photos`
    : `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(page.fb_page_id ?? "")}/feed`;
  const body = new URLSearchParams();
  body.set("access_token", token);
  if (brief.image_url) {
    body.set("url", brief.image_url);
    body.set("caption", caption);
    body.set("published", "true");
  } else {
    body.set("message", caption);
  }

  const response = await fetchWithTimeout(endpoint, { method: "POST", body, timeout: 15_000 });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.error) {
    const errorText = result.error?.message ?? JSON.stringify(result).slice(0, 200);
    await supabase
      .from("posts")
      .update({ status: "failed", last_error: errorText })
      .eq("idempotency_key", idempotencyKey);
    await supabase
      .from("content_briefs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", brief.id);
    throw new Error(errorText);
  }

  const fbPostId = result.post_id ?? result.id;
  const permalink = fbPostId ? `https://www.facebook.com/${fbPostId}` : null;
  await supabase
    .from("posts")
    .update({
      fb_post_id: fbPostId,
      fb_permalink_url: permalink,
      status: "published",
      published_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("idempotency_key", idempotencyKey);
  await supabase
    .from("content_briefs")
    .update({ status: "published", updated_at: new Date().toISOString() })
    .eq("id", brief.id);
}

async function captureEngagement(page: Page, windowDays: number) {
  const token = Deno.env.get("FBAI_FB_PAGE_TOKEN");
  if (!token) return "Skipped — Facebook page token missing.";
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select("id, fb_post_id")
    .eq("page_id", page.id)
    .eq("status", "published")
    .gte("published_at", since)
    .not("fb_post_id", "is", null);
  if (error) throw error;

  let captured = 0;
  for (const post of (data ?? []) as { id: string; fb_post_id: string }[]) {
    const metrics = await fetchFacebookMetrics(post.fb_post_id, token);
    await supabase.from("engagement_snapshots").insert({
      post_id: post.id,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      reactions: metrics.reactions,
      reach: metrics.reach,
      impressions: metrics.impressions,
    });
    captured += 1;
  }
  return `Captured ${captured} engagement snapshots.`;
}

async function fetchFacebookMetrics(fbPostId: string, token: string) {
  const fields =
    "shares,comments.summary(true),reactions.summary(true),insights.metric(post_impressions,post_impressions_unique)";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(fbPostId)}?fields=${encodeURIComponent(fields)}`;
  const response = await fetchWithTimeout(url, {
    timeout: 15_000,
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error)
    throw new Error(body.error?.message ?? `Graph API ${response.status}`);
  const insightValues = new Map<string, number>();
  for (const item of body.insights?.data ?? []) {
    insightValues.set(item.name, Number(item.values?.[0]?.value ?? 0));
  }
  return {
    likes: Number(body.reactions?.summary?.total_count ?? 0),
    comments: Number(body.comments?.summary?.total_count ?? 0),
    shares: Number(body.shares?.count ?? 0),
    reactions: body.reactions?.summary ?? {},
    reach: insightValues.get("post_impressions_unique") ?? 0,
    impressions: insightValues.get("post_impressions") ?? 0,
  };
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

async function completeJob(job: Job, status: string, detail: string) {
  const retryAt =
    status === "failed_retryable"
      ? new Date(Date.now() + Math.min(60, 2 ** Math.max(0, job.attempts)) * 60_000).toISOString()
      : null;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("jobs")
    .update({
      status,
      last_error: status === "succeeded" ? null : detail,
      next_retry_at: retryAt,
      lease_expires_at: null,
      completed_at: status === "succeeded" || status === "failed_terminal" ? now : null,
      updated_at: now,
    })
    .eq("id", job.id);
  if (error) throw error;
  await event(status === "succeeded" ? "info" : "error", "job", `${job.kind}: ${detail}`, {
    job_id: job.id,
  });
}

async function loadInsights(pageId: string) {
  const { data } = await supabase
    .from("strategy_insights")
    .select("best_posting_hour, best_topics, avg_engagement_rate, computed_at")
    .eq("page_id", pageId)
    .eq("window_days", 30)
    .maybeSingle();
  return data ?? {};
}

async function logUsage(pageId: string, jobId: string | null, provider: string, model: string) {
  await supabase.from("ai_usage").insert({ page_id: pageId, job_id: jobId, provider, model });
}

async function event(severity: string, category: string, message: string, metadata: Json = {}) {
  await supabase.from("system_events").insert({ severity, category, message, metadata });
}

function normalizedWindows(page: Page) {
  const windows =
    Array.isArray(page.default_posting_windows) && page.default_posting_windows.length
      ? page.default_posting_windows
      : [
          { hour: 9, minute: 0 },
          { hour: 13, minute: 0 },
          { hour: 18, minute: 0 },
        ];
  return windows.slice(0, Math.max(1, page.max_posts_per_day));
}

function upcomingSlots(
  windows: { hour: number; minute: number }[],
  horizonDays: number,
  maxPerDay: number,
) {
  const now = new Date();
  const slots: Date[] = [];
  for (let day = 0; day < horizonDays; day += 1) {
    const base = new Date(now);
    base.setUTCDate(base.getUTCDate() + day);
    for (const window of windows.slice(0, maxPerDay)) {
      const slot = new Date(base);
      slot.setUTCHours(window.hour, window.minute, 0, 0);
      if (slot > now) slots.push(slot);
    }
  }
  return slots;
}

function buildCaption(brief: Brief) {
  const tags = (brief.hashtags ?? [])
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  return [brief.caption ?? "", tags].filter(Boolean).join("\n\n").trim();
}

function fallbackTopic(page: Page, index: number) {
  const topics = Array.isArray(page.prompt_overrides?.topics)
    ? page.prompt_overrides.topics.map(String)
    : [];
  return topics[index % Math.max(1, topics.length)] ?? `${page.fb_page_name} update`;
}

function fallbackCaption(page: Page, index: number) {
  return `${fallbackTopic(page, index)} — a quick useful note from ${page.fb_page_name}.`;
}

function fallbackHashtags(page: Page) {
  const base = page.fb_page_name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [base ? `#${base}` : "#update", "#facebook", "#community"];
}

function fallbackImagePrompt(page: Page, index: number) {
  return `A polished social media image for ${fallbackTopic(page, index)}, modern brand style`;
}

function defaultLlmBaseUrl(provider: string) {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (provider === "nvidia") return "https://integrate.api.nvidia.com/v1";
  if (provider === "groq") return "https://api.groq.com/openai/v1";
  return "";
}

function floorBucket(date: Date, minutes: number) {
  const ms = minutes * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms).toISOString();
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function topEntry<T>(scores: Map<T, number>) {
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
}

function requiredEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}

function extractJson(value: string) {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  return first >= 0 && last > first ? value.slice(first, last + 1) : value;
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
