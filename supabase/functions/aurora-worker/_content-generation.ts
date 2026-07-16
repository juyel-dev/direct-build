/**
 * Content planning: deciding which posting slots need briefs, generating
 * brief ideas via LLM (with deterministic fallbacks), and image
 * generation/storage for those briefs.
 */
import {
  type Page,
  type Json,
  supabase,
  log,
  messageOf,
  fetchWithTimeout,
  AI_API_KEY,
  LLM_PROVIDER,
  LLM_MODEL,
  LLM_BASE_URL,
  FALLBACK_LLM_MODEL,
  IMAGE_PROVIDER,
  IMAGE_MODEL,
  IMAGE_API_KEY,
  IMAGE_STORAGE_BUCKET,
  PROMPT_VERSION,
  defaultLlmBaseUrl,
  loadInsights,
  loadBrandMemory,
  loadPostHistoryWithEngagement,
  computeQualityFeedback,
} from "./_core.ts";
import { isProviderAvailable, recordProviderFailure } from "./_lifecycle.ts";
import { extractLlmUsage, logUsage } from "./_ai-usage.ts";

function extractJson(value: string) {
  const first = value.indexOf("{");
  const last = value.lastIndexOf("}");
  return first >= 0 && last > first ? value.slice(first, last + 1) : value;
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

export async function planContent(page: Page, horizonDays: number) {
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
  if (!(await isProviderAvailable("llm"))) return [];

  const baseUrl = (LLM_BASE_URL || defaultLlmBaseUrl(LLM_PROVIDER)).replace(/\/+$/, "");
  if (!AI_API_KEY || !baseUrl) return [];

  const insights = await loadInsights(page.id);
  const brandMemory = await loadBrandMemory(page.id);
  const context = page.prompt_overrides ?? {};
  const brandSnippets = (brandMemory?.top_content_snippets ?? []) as Array<{
    topic?: string;
    caption?: string;
    score?: number;
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
      log("warn", "Image download failed", {
        url: externalUrl.slice(0, 80),
        status: response.status,
      });
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
    if (!(await isProviderAvailable("image"))) return null;
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
      await recordProviderFailure(
        "image",
        `Image API ${response.status}: ${JSON.stringify(body).slice(0, 200)}`,
      );
      return null;
    }
    return body.data?.[0]?.url ?? null;
  }
  return null;
}
