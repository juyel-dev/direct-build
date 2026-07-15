/**
 * Brand memory: deterministic extraction from post history, and
 * optional LLM-based deeper analysis (brand personality, content
 * pillars, storytelling style) layered on top.
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
  defaultLlmBaseUrl,
  loadBrandMemory,
  loadPostHistoryWithEngagement,
} from "./_core.ts";
import { isProviderAvailable, recordProviderFailure } from "./_lifecycle.ts";
import { extractLlmUsage, logUsage } from "./_ai-usage.ts";

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const CTA_WORDS =
  /\b(click|sign\s*up|subscribe|visit|share|follow|try|shop|buy|donate|register|learn\s*more|get\s*started|join|contact)\b/i;

type RichBrief = {
  topic?: string;
  caption?: string;
  hashtags?: string[];
  image_url?: string | null;
};

export async function extractBrandMemory(page: Page) {
  const windowMs = 90 * 86400_000;
  const since = new Date(Date.now() - windowMs).toISOString();

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select(
      `
      published_at,
      content_briefs!inner(topic, caption, hashtags, image_url),
      engagement_snapshots(likes, comments, shares, captured_at)
    `,
    )
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
  const avgCaptionLen =
    captionLengths.length > 0
      ? Math.round(captionLengths.reduce((a, b) => a + b, 0) / captionLengths.length)
      : null;
  const avgHashtagCount =
    hashtagCounts.length > 0
      ? Math.round((hashtagCounts.reduce((a, b) => a + b, 0) / hashtagCounts.length) * 10) / 10
      : null;
  const mediaRatio = totalPosts > 0 ? Math.round((mediaPostCount / totalPosts) * 100) / 100 : null;
  const ctaRatio = totalPosts > 0 ? Math.round((ctaPostCount / totalPosts) * 100) / 100 : null;
  const ctaFreq =
    ctaRatio == null
      ? "unknown"
      : ctaRatio < 0.1
        ? "rare"
        : ctaRatio < 0.3
          ? "occasional"
          : "frequent";
  const topEmojis = Array.from(emojiCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([e]) => e);

  const now = new Date().toISOString();
  const capCount = captionLengths.length;
  const htCount = hashtagCounts.length;
  const confidenceCap = (n: number, threshold: number) =>
    Math.round(Math.min(n / threshold, 1) * 100) / 100;
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

  const { error: upsertError } = await supabase.from("brand_memory").upsert(
    {
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
    },
    { onConflict: "page_id" },
  );

  if (upsertError) throw upsertError;
  const avgConf =
    Object.values(confidenceScores).reduce((a, b) => a + b, 0) /
    Object.keys(confidenceScores).length;
  return `Extracted brand memory from ${posts.length} posts (${bestDays.join(", ")} best days, ${topEmojis.length} emojis, ${ctaFreq} CTAs, confidence: ${Math.round(avgConf * 100)}%).`;
}

export async function analyzeBrandLlm(page: Page) {
  if (!AI_API_KEY) return "Skipped — no AI API key configured.";
  if (!(await isProviderAvailable("llm"))) return "Skipped — LLM provider in cooldown.";

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
      return {
        caption: p.content_briefs?.caption ?? "",
        topic: p.content_briefs?.topic ?? "",
        score,
      };
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
    ...topPosts.map(
      (p, i) =>
        `${i + 1}. "${p.caption.slice(0, 300)}" (score: ${p.score}, topic: ${p.topic || "general"})`,
    ),
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
        {
          role: "system",
          content: "You are a brand analyst. Return ONLY valid JSON. No markdown, no code fences.",
        },
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
    if (!FALLBACK_LLM_MODEL)
      return `Brand LLM call failed (${response.status}) — no fallback configured.`;
    log("warn", "Brand LLM primary failed, trying fallback", { model: FALLBACK_LLM_MODEL });
    const response2 = await fetchWithTimeout(url, {
      method: "POST",
      timeout: 45_000,
      headers: { "content-type": "application/json", authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: FALLBACK_LLM_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a brand analyst. Return ONLY valid JSON. No markdown, no code fences.",
          },
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

export async function parseAndStoreBrandLlm(pageId: string, body: string): Promise<string> {
  // NOTE (pre-existing, not introduced by this extraction): this type
  // annotation says the choices live under a nested `.data` property,
  // but the code below accesses `parsed?.choices` directly. This looks
  // like a stale/incorrect type annotation rather than a real runtime
  // bug -- JS ignores TS types at runtime, and a raw OpenAI-compatible
  // chat completion response is shaped as { choices: [...] }, matching
  // what the code actually reads. Worth a follow-up pass to fix the
  // annotation, not touched here since it doesn't affect behavior.
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

  const { error } = await supabase.from("brand_memory").upsert(
    {
      page_id: pageId,
      brand_personality: typeof data.brand_personality === "string" ? data.brand_personality : "",
      content_pillars: Array.isArray(data.content_pillars) ? data.content_pillars : [],
      storytelling_style:
        typeof data.storytelling_style === "string" ? data.storytelling_style : "",
      strengths_weaknesses: { strengths: data.strengths ?? [], weaknesses: data.weaknesses ?? [] },
      confidence_scores: confidenceScores,
      sources: sources,
      llm_analyzed_at: now,
      updated_at: now,
    },
    { onConflict: "page_id" },
  );

  if (error) {
    log("warn", "Failed to store LLM brand analysis", { page_id: pageId, error: messageOf(error) });
    return "Brand LLM analysis computed but failed to save.";
  }
  const avgConf =
    Object.values(confidenceScores).reduce((a, b) => a + b, 0) /
    Object.keys(confidenceScores).length;
  return `Brand LLM analysis saved (personality: ${(data.brand_personality as string)?.slice(0, 60) || "N/A"}, confidence: ${Math.round(avgConf * 100)}%).`;
}
