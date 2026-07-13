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
  IMAGE_PROVIDER,
  IMAGE_MODEL,
  IMAGE_API_KEY,
  IMAGE_STORAGE_BUCKET,
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
} from "./_core.ts";
import { FacebookAdapter, FacebookTokenError, PublishError, type PlatformAdapter } from "./_facebook-adapter.ts";
import {
  heartbeat,
  isProviderAvailable,
  recordProviderFailure,
  HEARTBEAT_INTERVAL_MS,
} from "./_lifecycle.ts";
import { isFacebookTokenErrorCode, isTerminalJobFailure } from "./_shared.ts";
import { extractLlmUsage, logUsage } from "./_ai-usage.ts";

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
    storage_image_path: ideas[index]?.storage_image_path ?? null,
    image_stored_at: ideas[index]?.image_stored_at ?? null,
    hook: ideas[index]?.hook ?? "",
    cta: ideas[index]?.cta ?? "",
    predicted_engagement_score: ideas[index]?.predicted_engagement_score ?? null,
    prompt_version: PROMPT_VERSION,
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
  if (!await isProviderAvailable("llm")) return [];

  const baseUrl = (LLM_BASE_URL || defaultLlmBaseUrl(LLM_PROVIDER)).replace(
    /\/+$/,
    "",
  );
  if (!AI_API_KEY || !baseUrl) return [];

  const insights = await loadInsights(page.id);
  const brandMemory = await loadBrandMemory(page.id);
  const context = page.prompt_overrides ?? {};
  const brandSnippets = (brandMemory?.top_content_snippets ?? []) as Array<{
    topic?: string; caption?: string; score?: number;
  }>;
  const posts = await loadPostHistoryWithEngagement(page.id, 90);
  const qualityFeedback = computeQualityFeedback(posts);
  const prompt = {
    brand: page.fb_page_name,
    voice: page.default_brand_voice ?? "",
    audience: String(context.audience ?? ""),
    audience_profile: brandMemory?.audience_profile ?? {},
    allowed_topics: Array.isArray(context.topics) ? context.topics : [],
    strategy: insights,
    brand_identity: brandMemory?.brand_descriptors ?? [],
    writing_style: brandMemory?.writing_style_notes ?? "",
    tone_guidelines: brandMemory?.tone_guidelines ?? "",
    effective_hashtags: brandMemory?.effective_hashtags ?? [],
    top_posts: brandSnippets.slice(0, 3).map((s: Record<string, unknown>) => ({
      topic: s.topic,
      caption: typeof s.caption === "string" ? s.caption.slice(0, 280) : "",
    })),
    avoided_topics: brandMemory?.avoided_topics ?? [],
    quality_feedback: qualityFeedback || undefined,
    slots: slots.map((slot) => slot.toISOString()),
  };

  let response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: "POST",
    timeout: 30_000,
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model: LLM_MODEL,
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
  let body = await response.text();
  if (!response.ok && FALLBACK_LLM_MODEL) {
    log("warn", "Brief LLM primary model failed, trying fallback", { model: LLM_MODEL });
    response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: "POST",
      timeout: 30_000,
      headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: FALLBACK_LLM_MODEL,
        messages: [
          { role: "system", content: "You write Facebook content plans. Return JSON only." },
          { role: "user", content: JSON.stringify(prompt) },
        ],
        response_format: { type: "json_object" },
        temperature: 0.75,
      }),
    });
    body = await response.text();
  }
  const usage = extractLlmUsage(body);
  await logUsage(page.id, null, LLM_PROVIDER, LLM_MODEL, usage);
  if (!response.ok) {
    await recordProviderFailure("llm", `LLM ${response.status}: ${body.slice(0, 240)}`);
    throw new Error(`LLM ${response.status}: ${body.slice(0, 240)}`);
  }

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
  const externalUrl = await maybeGenerateImageUrl(imagePrompt);
  let imageUrl = externalUrl;
  let storagePath: string | null = null;
  let storedAt: string | null = null;
  if (externalUrl) {
    const result = await downloadAndStoreImage(externalUrl, page.id);
    if (result) {
      imageUrl = result.publicUrl;
      storagePath = result.path;
      storedAt = result.storedAt;
    }
  }
  return {
    topic: typeof brief.topic === "string" ? brief.topic : fallbackTopic(page, index),
    caption: typeof brief.caption === "string" ? brief.caption : fallbackCaption(page, index),
    hashtags: Array.isArray(brief.hashtags)
      ? brief.hashtags.map(String).slice(0, 8)
      : fallbackHashtags(page),
    image_prompt: imagePrompt,
    image_url: imageUrl,
    storage_image_path: storagePath,
    image_stored_at: storedAt,
    hook: typeof brief.hook === "string" ? brief.hook : "",
    cta: typeof brief.cta === "string" ? brief.cta : "",
    predicted_engagement_score:
      typeof brief.predicted_engagement_score === "number"
        ? brief.predicted_engagement_score
        : null,
  };
}

async function downloadAndStoreImage(
  externalUrl: string,
  pageId: string,
): Promise<{ publicUrl: string; path: string; storedAt: string } | null> {
  try {
    const response = await fetchWithTimeout(externalUrl, { timeout: 20_000 });
    if (!response.ok) {
      log("warn", "Image download failed", { url: externalUrl.slice(0, 80), status: response.status });
      return null;
    }
    const blob = await response.blob();
    const ext = blob.type.split("/")[1] || "png";
    const fileName = `${crypto.randomUUID().slice(0, 12)}.${ext}`;
    const path = `${IMAGE_STORAGE_BUCKET}/${pageId}/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from(IMAGE_STORAGE_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: true });
    if (uploadError) {
      log("warn", "Image storage upload failed", { error: messageOf(uploadError) });
      return null;
    }
    const { data } = supabase.storage.from(IMAGE_STORAGE_BUCKET).getPublicUrl(path);
    return { publicUrl: data.publicUrl, path, storedAt: new Date().toISOString() };
  } catch (error) {
    log("warn", "Image download or storage error", { error: messageOf(error) });
    return null;
  }
}

async function maybeGenerateImageUrl(prompt: string): Promise<string | null> {
  if (!prompt) return null;
  if (IMAGE_PROVIDER === "pollinations") {
    return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=${encodeURIComponent(IMAGE_MODEL)}&nologo=true`;
  }
  if (IMAGE_PROVIDER === "openai_dalle" && IMAGE_API_KEY) {
    if (!await isProviderAvailable("image")) return null;
    const response = await fetchWithTimeout("https://api.openai.com/v1/images/generations", {
      method: "POST",
      timeout: 20_000,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${IMAGE_API_KEY}`,
      },
      body: JSON.stringify({ model: IMAGE_MODEL, prompt, size: "1024x1024", n: 1 }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      await recordProviderFailure("image", `Image API ${response.status}: ${JSON.stringify(body).slice(0, 200)}`);
      return null;
    }
    return body.data?.[0]?.url ?? null;
  }
  return null;
}

const platform = new FacebookAdapter();

async function validateImageForPublish(brief: Brief): Promise<{ valid: boolean; error?: string }> {
  if (!brief.image_url) return { valid: true };
  try {
    const response = await fetchWithTimeout(brief.image_url, { method: "HEAD", timeout: 10_000 });
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!contentType.startsWith("image/")) {
      return { valid: false, error: `Image has invalid content-type: ${contentType}` };
    }
    if (contentLength > 8_000_000) {
      return { valid: false, error: `Image exceeds 8MB (${Math.round(contentLength / 1_000_000)}MB)` };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Image unreachable: ${messageOf(e)}` };
  }
}

const SPAMMY_PATTERNS = [
  /\b(buy\s+now|click\s+here|free\s+money|act\s+now|limited\s+time|don't\s+miss\s+out)\b/i,
  /\b(follow\s+for\s+follow|like4like|comment4comment)\b/i,
  /\$\d{3,}/,
];

async function validateCaptionForPublish(brief: Brief): Promise<{ valid: boolean; error?: string }> {
  const caption = buildCaption(brief);
  const isPhoto = !!brief.image_url;
  const maxLen = isPhoto ? 2200 : 63206;
  if (caption.length > maxLen) {
    return { valid: false, error: `Caption too long (${caption.length}/${maxLen}) for ${isPhoto ? "photo" : "feed"} post` };
  }
  if (!caption.trim() && !isPhoto) {
    return { valid: false, error: "Caption is empty and no image provided" };
  }
  for (const pattern of SPAMMY_PATTERNS) {
    if (pattern.test(caption)) {
      return { valid: false, error: `Caption flagged as spammy: "${caption.match(pattern)?.[0]}"` };
    }
  }
  return { valid: true };
}

async function publishDuePosts(page: Page) {
  if (!page.fb_page_id) return "Skipped — Facebook page id missing.";
  if (!await isProviderAvailable("facebook")) return "Skipped — Facebook API in cooldown.";
  if (!PAGE_TOKEN) return "Skipped — Facebook page token missing.";

  const tokenCheck = await platform.validateToken(PAGE_TOKEN);
  if (!tokenCheck.valid) {
    log("error", "facebook_token_invalid", { page_id: page.id, error: tokenCheck.error });
    await supabase.from("system_events").insert({
      severity: "error",
      category: "facebook_token_expired",
      message: tokenCheck.error ?? "Facebook token invalid before publish.",
      metadata: { page_id: page.id, page_name: page.fb_page_name },
    });
    return `Skipped — ${tokenCheck.error}`;
  }

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
  let skipped = 0;
  for (const brief of briefs) {
    const imageCheck = await validateImageForPublish(brief);
    if (!imageCheck.valid) {
      log("warn", "pre-publish image validation failed", { brief_id: brief.id, error: imageCheck.error });
      skipped++;
      continue;
    }
    const captionCheck = await validateCaptionForPublish(brief);
    if (!captionCheck.valid) {
      log("warn", "pre-publish caption validation failed", { brief_id: brief.id, error: captionCheck.error });
      skipped++;
      continue;
    }
    const claimed = await claimBriefForPublish(brief.id);
    if (!claimed) continue;
    await publishBrief(page, brief, PAGE_TOKEN);
    published += 1;
  }
  return `Published ${published} due posts${skipped > 0 ? ` (${skipped} skipped by validation)` : ""}.`;
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

  try {
    const { fbPostId, permalink } = await platform.publishPost(page, brief, token, caption);
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
  } catch (e) {
    const message = messageOf(e);
    if (e instanceof FacebookTokenError) {
      log("error", "facebook_token_expired", { message: message.slice(0, 200) });
      await supabase.from("system_events").insert({
        severity: "error",
        category: "facebook_token_expired",
        message: "Facebook page token has expired. Go to Settings → Facebook page → Test Facebook to update.",
        metadata: { page_id: page.id, page_name: page.fb_page_name },
      });
      await supabase
        .from("posts")
        .update({ status: "failed", last_error: "Facebook token expired. Update in Settings." })
        .eq("idempotency_key", idempotencyKey);
      await supabase
        .from("content_briefs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", brief.id);
      throw new Error("TOKEN_EXPIRED: Facebook token expired. Update in Settings → Facebook page.");
    }
    await recordProviderFailure("facebook", `Publish: ${message}`);
    await supabase
      .from("posts")
      .update({ status: "failed", last_error: message })
      .eq("idempotency_key", idempotencyKey);
    await supabase
      .from("content_briefs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", brief.id);
    throw e;
  }
}

async function cleanupImages(page: Page) {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data: expired, error } = await supabase
    .from("content_briefs")
    .select("id, storage_image_path")
    .eq("page_id", page.id)
    .eq("storage_image_pinned", false)
    .not("storage_image_path", "is", null)
    .not("image_stored_at", "is", null)
    .lt("image_stored_at", cutoff);
  if (error) {
    log("warn", "Failed to query expired images", { page_id: page.id, error: messageOf(error) });
    return "Error querying expired images.";
  }
  if (!expired || expired.length === 0) return "No expired images to clean up.";
  let deleted = 0;
  const paths = expired.map((b: { storage_image_path: string }) => b.storage_image_path);
  for (const path of paths) {
    const { error: removeError } = await supabase.storage
      .from(IMAGE_STORAGE_BUCKET)
      .remove([path]);
    if (removeError) {
      log("warn", "Failed to remove image from storage", { path, error: messageOf(removeError) });
    }
    deleted++;
  }
  const ids = expired.map((b: { id: string }) => b.id);
  await supabase
    .from("content_briefs")
    .update({ storage_image_path: null, image_stored_at: null, updated_at: new Date().toISOString() })
    .in("id", ids);
  return `Cleaned up ${deleted} expired images.`;
}

async function captureEngagement(page: Page, windowDays: number) {
  if (!PAGE_TOKEN) return "Skipped — Facebook page token missing.";
  if (!await isProviderAvailable("facebook")) return "Skipped — Facebook API in cooldown.";

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
    const metrics = await fetchFacebookMetrics(post.fb_post_id, PAGE_TOKEN);
    if (!metrics) continue;
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
  if (!await isProviderAvailable("facebook")) return null;
  // Meta deprecated post_impressions (replaced by post_media_view, effective
  // Nov 15 2025) and post_impressions_unique (replaced by
  // post_total_media_view_unique, effective Jun 15 2026 -- a very recent
  // change as of this fix). Both were previously requested in this single
  // combined insights call; since Meta's Insights API returns a single hard
  // error for the whole request if any requested metric is invalid, using
  // either deprecated name here would fail metrics capture entirely, not
  // just return a stale/zero value for that one field.
  const fields =
    "shares,comments.summary(true),reactions.summary(true),insights.metric(post_media_view,post_total_media_view_unique)";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(fbPostId)}?fields=${encodeURIComponent(fields)}`;
  const response = await fetchWithTimeout(url, {
    timeout: 15_000,
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const errMsg = body.error?.message ?? `Graph API ${response.status}`;
    // Record under a separate circuit key from "facebook" (used for
    // publishing) so a metrics-fetch failure -- e.g. a future metric-name
    // deprecation like this one -- can no longer trip the circuit breaker
    // that gates actual post publishing.
    await recordProviderFailure("facebook_metrics", errMsg);
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Facebook Graph API returned unexpected response shape: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const likes = Number(body.reactions?.summary?.total_count);
  const comments = Number(body.comments?.summary?.total_count);
  const shares = Number(body.shares?.count);
  if (!Number.isFinite(likes) || !Number.isFinite(comments) || !Number.isFinite(shares)) {
    throw new Error(
      `Facebook Graph API response missing expected metrics fields: likes=${JSON.stringify(body.reactions?.summary?.total_count)}, comments=${JSON.stringify(body.comments?.summary?.total_count)}, shares=${JSON.stringify(body.shares?.count)}`,
    );
  }
  const insightValues = new Map<string, number>();
  if (body.insights && typeof body.insights === "object" && Array.isArray(body.insights.data)) {
    for (const item of body.insights.data) {
      if (item && typeof item.name === "string") {
        insightValues.set(item.name, Number(item.values?.[0]?.value ?? 0));
      }
    }
  }
  return {
    likes,
    comments,
    shares,
    reactions: body.reactions?.summary ?? {},
    reach: insightValues.get("post_total_media_view_unique") ?? 0,
    impressions: insightValues.get("post_media_view") ?? 0,
  };
}

async function aggregateDailyAnalytics(page: Page) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const dayStart = `${dateStr}T00:00:00Z`;
  const dayEnd = `${dateStr}T23:59:59Z`;

  const { data, error } = await supabase
    .from("engagement_snapshots")
    .select("likes, comments, shares, reach, impressions")
    .gte("captured_at", dayStart)
    .lte("captured_at", dayEnd);
  if (error) {
    log("warn", "Failed to query snapshots for daily aggregation", { page_id: page.id, error: messageOf(error) });
    return "Error aggregating daily analytics.";
  }
  if (!data || data.length === 0) return `No snapshots for ${dateStr}.`;

  let totalLikes = 0, totalComments = 0, totalShares = 0, totalReach = 0, totalImpressions = 0;
  const seen = new Set<string>();
  for (const s of data as Array<{ likes: number; comments: number; shares: number; reach: number; impressions: number }>) {
    totalLikes += s.likes ?? 0;
    totalComments += s.comments ?? 0;
    totalShares += s.shares ?? 0;
    totalReach += s.reach ?? 0;
    totalImpressions += s.impressions ?? 0;
    seen.add(`${s.likes}-${s.comments}-${s.shares}`);
  }

  await supabase.from("analytics_daily").upsert({
    page_id: page.id,
    date: dateStr,
    total_likes: totalLikes,
    total_comments: totalComments,
    total_shares: totalShares,
    total_reach: totalReach,
    total_impressions: totalImpressions,
    post_count: seen.size,
  }, { onConflict: "page_id,date" });

  return `Aggregated ${data.length} snapshots into ${dateStr} analytics.`;
}

async function cleanupOldSnapshots(page: Page) {
  const cutoff = new Date(Date.now() - 365 * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("engagement_snapshots")
    .select("id")
    .lt("captured_at", cutoff);
  if (error) {
    log("warn", "Failed to query old snapshots", { page_id: page.id, error: messageOf(error) });
    return "Error querying old snapshots.";
  }
  if (!data || data.length === 0) return "No old snapshots to clean up.";
  const ids = data.map((s: { id: string }) => s.id);
  const { error: deleteError } = await supabase
    .from("engagement_snapshots")
    .delete()
    .in("id", ids);
  if (deleteError) {
    log("warn", "Failed to delete old snapshots", { page_id: page.id, error: messageOf(deleteError) });
    return "Error deleting old snapshots.";
  }
  return `Cleaned up ${ids.length} snapshots older than 365 days.`;
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

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const CTA_WORDS = /\b(click|sign\s*up|subscribe|visit|share|follow|try|shop|buy|donate|register|learn\s*more|get\s*started|join|contact)\b/i;

type RichBrief = {
  topic?: string; caption?: string; hashtags?: string[]; image_url?: string | null;
};

async function extractBrandMemory(page: Page) {
  const windowMs = 90 * 86400_000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(`
      published_at,
      content_briefs!inner(topic, caption, hashtags, image_url),
      engagement_snapshots(likes, comments, shares, captured_at)
    `)
    .eq("page_id", page.id)
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: false });
  if (postsError) throw postsError;

  if (!posts || posts.length === 0) return "No published posts found for brand extraction.";

  const hashtagCount = new Map<string, number>();
  const tones = new Set<string>();
  const snippets: Array<{ topic: string; caption: string; score: number }> = [];
  const dayScores = new Map<number, number>();
  const captionLengths: number[] = [];
  const emojiCount = new Map<string, number>();
  let ctaPostCount = 0;
  let mediaPostCount = 0;
  const hashtagCounts: number[] = [];

  for (const post of posts as Array<{
    published_at?: string;
    content_briefs?: RichBrief;
    engagement_snapshots?: Array<{ likes?: number; comments?: number; shares?: number }>;
  }>) {
    const brief = post.content_briefs;
    if (!brief) continue;

    if (Array.isArray(brief.hashtags)) {
      for (const tag of brief.hashtags) {
        hashtagCount.set(tag, (hashtagCount.get(tag) ?? 0) + 1);
      }
      hashtagCounts.push(brief.hashtags.length);
    }

    const snaps = post.engagement_snapshots ?? [];
    const latest = snaps[snaps.length - 1] ?? {};
    const score = (latest.likes ?? 0) + (latest.comments ?? 0) * 2 + (latest.shares ?? 0) * 3;

    if (post.published_at) {
      const day = new Date(post.published_at).getUTCDay();
      dayScores.set(day, (dayScores.get(day) ?? 0) + score);
    }

    if (brief.caption) {
      captionLengths.push(brief.caption.length);
      const emojis = brief.caption.match(EMOJI_RE);
      if (emojis) {
        for (const e of emojis) emojiCount.set(e, (emojiCount.get(e) ?? 0) + 1);
      }
      if (CTA_WORDS.test(brief.caption)) ctaPostCount++;
    }

    if (brief.image_url) mediaPostCount++;

    if (brief.caption && score > 0) {
      snippets.push({ topic: brief.topic ?? "", caption: brief.caption, score });
      if (brief.caption.length < 100) tones.add("concise");
      else if (brief.caption.length < 200) tones.add("moderate");
      else tones.add("detailed");
    }
  }

  snippets.sort((a, b) => b.score - a.score);

  const effectiveHashtags = Array.from(hashtagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag]) => tag);

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const bestDays = Array.from(dayScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d]) => DAY_NAMES[d]);

  const totalPosts = posts.length;
  const avgCaptionLen = captionLengths.length > 0
    ? Math.round(captionLengths.reduce((a, b) => a + b, 0) / captionLengths.length)
    : null;
  const avgHashtagCount = hashtagCounts.length > 0
    ? Math.round((hashtagCounts.reduce((a, b) => a + b, 0) / hashtagCounts.length) * 10) / 10
    : null;
  const mediaRatio = totalPosts > 0 ? Math.round((mediaPostCount / totalPosts) * 100) / 100 : null;
  const ctaRatio = totalPosts > 0 ? Math.round((ctaPostCount / totalPosts) * 100) / 100 : null;
  const ctaFreq = ctaRatio == null ? "unknown" : ctaRatio < 0.1 ? "rare" : ctaRatio < 0.3 ? "occasional" : "frequent";
  const topEmojis = Array.from(emojiCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  const now = new Date().toISOString();
  const capCount = captionLengths.length;
  const htCount = hashtagCounts.length;
  const confidenceCap = (n: number, threshold: number) => Math.round(Math.min(n / threshold, 1) * 100) / 100;
  const confidenceScores = {
    best_posting_days: confidenceCap(totalPosts, 15),
    caption_length_avg: confidenceCap(capCount, 10),
    emoji_usage: confidenceCap(totalPosts, 10),
    cta_frequency: confidenceCap(totalPosts, 10),
    media_usage_ratio: confidenceCap(totalPosts, 10),
    hashtag_count_avg: confidenceCap(htCount, 10),
  };
  const sources = {
    best_posting_days: "auto_extracted",
    caption_length_avg: "auto_extracted",
    emoji_usage: "auto_extracted",
    cta_frequency: "auto_extracted",
    media_usage_ratio: "auto_extracted",
    hashtag_count_avg: "auto_extracted",
  };

  const { error: upsertError } = await supabase.from("brand_memory").upsert({
    page_id: page.id,
    writing_style_notes: Array.from(tones).length
      ? `Posts tend to be ${Array.from(tones).join(", ")} in length.`
      : "",
    effective_hashtags: effectiveHashtags,
    top_content_snippets: snippets.slice(0, 5).map((s) => ({
      topic: s.topic,
      caption: typeof s.caption === "string" ? s.caption.slice(0, 200) : "",
      score: s.score,
    })),
    best_posting_days: bestDays,
    caption_length_avg: avgCaptionLen,
    emoji_usage: topEmojis,
    cta_frequency: ctaFreq,
    media_usage_ratio: mediaRatio,
    hashtag_count_avg: avgHashtagCount,
    confidence_scores: confidenceScores,
    sources: sources,
    auto_extracted_at: now,
    updated_at: now,
  }, { onConflict: "page_id" });

  if (upsertError) throw upsertError;
  const avgConf = Object.values(confidenceScores).reduce((a, b) => a + b, 0) / Object.keys(confidenceScores).length;
  return `Extracted brand memory from ${posts.length} posts (${bestDays.join(", ")} best days, ${topEmojis.length} emojis, ${ctaFreq} CTAs, confidence: ${Math.round(avgConf * 100)}%).`;
}

async function analyzeBrandLlm(page: Page) {
  if (!AI_API_KEY) return "Skipped — no AI API key configured.";
  if (!await isProviderAvailable("llm")) return "Skipped — LLM provider in cooldown.";

  const [memory, posts] = await Promise.all([
    loadBrandMemory(page.id),
    loadPostHistoryWithEngagement(page.id, 90),
  ]);

  if (!posts || posts.length < 3) return "Skipped — need at least 3 posts for LLM analysis.";
  if (!memory) return "Skipped — no brand memory exists yet; run extract_brand_memory first.";

  const topPosts = posts
    .filter((p) => p.engagement_snapshots?.length)
    .map((p) => {
      const snaps = p.engagement_snapshots!;
      const latest = snaps[snaps.length - 1] ?? {};
      const score = (latest.likes ?? 0) + (latest.comments ?? 0) * 2 + (latest.shares ?? 0) * 3;
      return { caption: p.content_briefs?.caption ?? "", topic: p.content_briefs?.topic ?? "", score };
    })
    .filter((p) => p.caption.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  if (topPosts.length < 3) return "Skipped — fewer than 3 posts with captions found.";

  const prompt = [
    `You are a brand analyst. Analyze the following brand data and recent posts to extract brand personality, content pillars, storytelling style, and strengths/weaknesses.`,
    ``,
    `Current brand memory:`,
    `- Writing style: ${memory.writing_style_notes || "(not set)"}`,
    `- Tone guidelines: ${memory.tone_guidelines || "(not set)"}`,
    `- Brand descriptors: ${memory.brand_descriptors?.join(", ") || "(none)"}`,
    `- Top hashtags: ${memory.effective_hashtags?.join(", ") || "(none)"}`,
    `- Best posting days: ${memory.best_posting_days?.join(", ") || "(unknown)"}`,
    `- CTA frequency: ${memory.cta_frequency || "unknown"}`,
    `- Avg caption length: ${memory.caption_length_avg ?? "unknown"} chars`,
    `- Media usage ratio: ${memory.media_usage_ratio ?? "unknown"}`,
    ``,
    `Top posts by engagement (caption, engagement score):`,
    ...topPosts.map((p, i) => `${i + 1}. "${p.caption.slice(0, 300)}" (score: ${p.score}, topic: ${p.topic || "general"})`),
    ``,
    `Return a JSON object with exactly these keys:`,
    `{`,
    `  "brand_personality": "2-3 sentence description",`,
    `  "content_pillars": ["pillar1", "pillar2", ...],`,
    `  "storytelling_style": "1-2 sentence description",`,
    `  "strengths": ["strength1", "strength2", ...],`,
    `  "weaknesses": ["weakness1", "weakness2", ...]`,
    `}`,
  ].join("\n");

  const baseUrl = LLM_BASE_URL || defaultLlmBaseUrl(LLM_PROVIDER);
  if (!baseUrl) return "Skipped — no LLM base URL configured.";

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    timeout: 45_000,
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: "You are a brand analyst. Return ONLY valid JSON. No markdown, no code fences." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    }),
  });

  const body = await response.text();
  const usage = extractLlmUsage(body);
  await logUsage(page.id, null, LLM_PROVIDER, LLM_MODEL, usage);

  if (!response.ok) {
    await recordProviderFailure("llm", `Brand LLM ${response.status}: ${body.slice(0, 240)}`);
    if (!FALLBACK_LLM_MODEL) return `Brand LLM call failed (${response.status}) — no fallback configured.`;
    log("warn", "Brand LLM primary failed, trying fallback", { model: FALLBACK_LLM_MODEL });
    const response2 = await fetchWithTimeout(url, {
      method: "POST",
      timeout: 45_000,
      headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: FALLBACK_LLM_MODEL,
        messages: [
          { role: "system", content: "You are a brand analyst. Return ONLY valid JSON. No markdown, no code fences." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });
    const body2 = await response2.text();
    const usage2 = extractLlmUsage(body2);
    await logUsage(page.id, null, LLM_PROVIDER, FALLBACK_LLM_MODEL, usage2);
    if (!response2.ok) return `Brand LLM fallback also failed (${response2.status}).`;
    return await parseAndStoreBrandLlm(page.id, body2);
  }

  return await parseAndStoreBrandLlm(page.id, body);
}

async function parseAndStoreBrandLlm(pageId: string, body: string): Promise<string> {
  let parsed: { data?: { choices?: { message?: { content?: string } }[] } };
  try {
    parsed = JSON.parse(body);
  } catch {
    return "Brand LLM returned non-JSON response.";
  }
  const content = parsed?.choices?.[0]?.message?.content ?? "{}";
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content);
  } catch {
    return "Brand LLM returned invalid JSON in message content.";
  }

  const now = new Date().toISOString();
  const confidenceScores = {
    brand_personality: 0.8,
    content_pillars: 0.75,
    storytelling_style: 0.7,
    strengths_weaknesses: 0.65,
  };
  const sources = {
    brand_personality: "llm_analysis",
    content_pillars: "llm_analysis",
    storytelling_style: "llm_analysis",
    strengths_weaknesses: "llm_analysis",
  };

  const { error } = await supabase.from("brand_memory").upsert({
    page_id: pageId,
    brand_personality: typeof data.brand_personality === "string" ? data.brand_personality : "",
    content_pillars: Array.isArray(data.content_pillars) ? data.content_pillars : [],
    storytelling_style: typeof data.storytelling_style === "string" ? data.storytelling_style : "",
    strengths_weaknesses: { strengths: data.strengths ?? [], weaknesses: data.weaknesses ?? [] },
    confidence_scores: confidenceScores,
    sources: sources,
    llm_analyzed_at: now,
    updated_at: now,
  }, { onConflict: "page_id" });

  if (error) {
    log("warn", "Failed to store LLM brand analysis", { page_id: pageId, error: messageOf(error) });
    return "Brand LLM analysis computed but failed to save.";
  }
  const avgConf = Object.values(confidenceScores).reduce((a, b) => a + b, 0) / Object.keys(confidenceScores).length;
  return `Brand LLM analysis saved (personality: ${(data.brand_personality as string)?.slice(0, 60) || "N/A"}, confidence: ${Math.round(avgConf * 100)}%).`;
}

type PostWithEngagement = {
  published_at: string | null;
  engagement_snapshots: Array<{ likes?: number; comments?: number; shares?: number; captured_at?: string }> | null;
  content_briefs: { topic?: string | null; caption?: string | null; predicted_engagement_score?: number | null } | null;
};

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

async function loadPostHistoryWithEngagement(pageId: string, windowDays: number): Promise<PostWithEngagement[]> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select("published_at, engagement_snapshots(likes, comments, shares, captured_at), content_briefs(topic, caption, predicted_engagement_score)")
    .eq("page_id", pageId)
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PostWithEngagement[];
}

// Mirrors src/services/strategy.service.ts computeQualityFeedback
// Keep both copies in sync when making changes
function computeQualityFeedback(posts: PostWithEngagement[]): string {
  const byTopic = new Map<string, { predicted: number[]; actual: number[]; count: number }>();
  for (const p of posts) {
    const brief = p.content_briefs;
    if (!brief || !brief.topic) continue;
    const predicted = brief.predicted_engagement_score;
    if (predicted == null) continue;
    const snaps = p.engagement_snapshots ?? [];
    const latest = snaps[snaps.length - 1] ?? {};
    const actual = (latest.likes ?? 0) + (latest.comments ?? 0) * 2 + (latest.shares ?? 0) * 3;
    const entry = byTopic.get(brief.topic) ?? { predicted: [], actual: [], count: 0 };
    entry.predicted.push(predicted);
    entry.actual.push(actual);
    entry.count++;
    byTopic.set(brief.topic, entry);
  }
  const lines: string[] = [];
  for (const [topic, data] of byTopic) {
    if (data.count < 2) continue;
    const avgPred = data.predicted.reduce((a, b) => a + b, 0) / data.predicted.length;
    const avgAct = data.actual.reduce((a, b) => a + b, 0) / data.actual.length;
    const delta = avgAct - avgPred;
    const sign = delta >= 0 ? "+" : "";
    lines.push(`- ${topic}: predicted ${avgPred.toFixed(1)}, actual ${avgAct.toFixed(1)} (${sign}${delta.toFixed(1)} delta)`);
  }
  return lines.length ? `Quality feedback (predicted vs actual):\n${lines.join("\n")}` : "";
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

async function loadInsights(pageId: string) {
  const { data } = await supabase
    .from("strategy_insights")
    .select("best_posting_hour, best_topics, avg_engagement_rate, computed_at")
    .eq("page_id", pageId)
    .eq("window_days", 30)
    .maybeSingle();
  return data ?? {};
}

// src/types/index.ts:156 (BrandMemory)
type BrandMemoryRow = {
  brand_descriptors: string[];
  audience_profile: Json;
  writing_style_notes: string;
  effective_hashtags: string[];
  top_content_snippets: Json[];
  tone_guidelines: string;
  avoided_topics: string[];
  best_posting_days: string[];
  caption_length_avg: number | null;
  emoji_usage: string[];
  cta_frequency: string;
  media_usage_ratio: number | null;
  hashtag_count_avg: number | null;
  brand_personality?: string;
  content_pillars?: string[];
  storytelling_style?: string;
  strengths_weaknesses?: Json;
  llm_analyzed_at?: string | null;
};

async function loadBrandMemory(pageId: string): Promise<BrandMemoryRow | null> {
  const { data, error } = await supabase
    .from("brand_memory")
    .select("brand_descriptors, audience_profile, writing_style_notes, effective_hashtags, top_content_snippets, tone_guidelines, avoided_topics, brand_personality, content_pillars, storytelling_style, strengths_weaknesses, llm_analyzed_at")
    .eq("page_id", pageId)
    .maybeSingle();
  if (error) {
    log("warn", "Brand memory load failed", { page_id: pageId, error: messageOf(error) });
    return null;
  }
  return data as BrandMemoryRow | null;
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

function extractJson(value: string) {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  return first >= 0 && last > first ? value.slice(first, last + 1) : value;
}
