/**
 * The strategy engine: computing posting-time/topic insights from
 * history, and generating AI + deterministic recommendations.
 */
import {
  type Page,
  type BrandMemoryRow,
  type PostWithEngagement,
  supabase,
  log,
  messageOf,
  fetchWithTimeout,
  AI_API_KEY,
  LLM_PROVIDER,
  LLM_MODEL,
  LLM_BASE_URL,
  FALLBACK_LLM_MODEL,
  PROMPT_VERSION,
  STRATEGY_VERSION,
  defaultLlmBaseUrl,
  loadInsights,
  loadBrandMemory,
  loadPostHistoryWithEngagement,
  computeQualityFeedback,
} from "./_core.ts";
import { isProviderAvailable, recordProviderFailure } from "./_lifecycle.ts";
import { extractLlmUsage, logUsage } from "./_ai-usage.ts";

function topEntry<T>(scores: Map<T, number>) {
  return Array.from(scores.entries()).sort((a, b) => b[1] - a[1])[0];
}

export async function computeStrategy(page: Page, windowDays: number) {
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
  return raw
    .filter(
      (r): r is StrategyRec =>
        r != null &&
        typeof (r as Record<string, unknown>).recommendation_type === "string" &&
        typeof (r as Record<string, unknown>).recommendation_text === "string",
    )
    .map((r) => ({
      recommendation_type: (r as Record<string, unknown>).recommendation_type as string,
      recommendation_text: (r as Record<string, unknown>).recommendation_text as string,
      reasoning:
        typeof (r as Record<string, unknown>).reasoning === "string"
          ? ((r as Record<string, unknown>).reasoning as string)
          : "",
      priority:
        typeof (r as Record<string, unknown>).priority === "number"
          ? ((r as Record<string, unknown>).priority as number)
          : 0,
      related_content: Array.isArray((r as Record<string, unknown>).related_content)
        ? ((r as Record<string, unknown>).related_content as Array<{ type: string; text: string }>)
        : [],
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
        score:
          Number(latest.likes ?? 0) +
          Number(latest.comments ?? 0) * 2 +
          Number(latest.shares ?? 0) * 3,
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
        memory.brand_descriptors?.length
          ? `Brand identity: ${memory.brand_descriptors.join(", ")}.`
          : "",
        memory.writing_style_notes ? `Style: ${memory.writing_style_notes}.` : "",
        memory.tone_guidelines ? `Tone: ${memory.tone_guidelines}.` : "",
        memory.effective_hashtags?.length
          ? `Top hashtags: ${memory.effective_hashtags.join(", ")}.`
          : "",
        memory.avoided_topics?.length ? `Avoid: ${memory.avoided_topics.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ")
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
      topic: p.topic,
      caption: p.caption,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      score: p.score,
    })),
    underperforming_posts: bottomPosts.map((p) => ({
      topic: p.topic,
      caption: p.caption,
      score: p.score,
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
        {
          role: "system",
          content:
            "You are a Facebook content strategy analyst. Return ONLY valid JSON. No markdown, no code fences.",
        },
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
  // NOTE (pre-existing, not introduced by this extraction): same stale
  // type annotation vs actual access pattern mismatch as in
  // _brand-memory.ts's parseAndStoreBrandLlm -- see the note there.
  // Preserved as-is; a follow-up pass should fix both together.
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
      recommendation_text:
        "Fewer than 10% of your posts include a call-to-action. Adding CTAs like 'Click the link' or 'Share your thoughts' can boost engagement.",
      reasoning: `CTA frequency is ${memory.cta_frequency} across ${posts.length} analyzed posts.`,
      priority: 8,
    });
  } else if (memory?.cta_frequency && memory.cta_frequency === "occasional") {
    recs.push({
      recommendation_type: "deterministic_content",
      recommendation_text:
        "About a quarter of your posts include a call-to-action. Try increasing CTAs to drive more clicks and comments.",
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
      recommendation_text:
        "Your posts use very few hashtags. Adding 3-5 relevant hashtags can increase discoverability.",
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
    const hourStr =
      bestHour > 12 ? `${bestHour - 12}pm` : bestHour === 12 ? "12pm" : `${bestHour}am`;
    recs.push({
      recommendation_type: "deterministic_timing",
      recommendation_text: `Your best posting time is around ${hourStr}. Schedule posts near this hour for maximum reach.`,
      reasoning: `Peak engagement hour identified from ${posts.length} posts.`,
      priority: 6,
    });
  }

  return recs;
}

export async function generateStrategy(page: Page) {
  if (!AI_API_KEY) return "Skipped — no AI API key configured.";
  if (!(await isProviderAvailable("llm"))) return "Skipped — LLM provider in cooldown.";

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
      model: LLM_MODEL,
      error: messageOf(error),
    });
    if (!FALLBACK_LLM_MODEL) throw error;
    aiRecommendations = await callLlmForStrategy(
      prompt,
      baseUrl,
      AI_API_KEY,
      FALLBACK_LLM_MODEL,
      page.id,
    );
  }

  const deterministicRecs = computeDeterministicRecs(memory, insights, posts, page);
  const allRecs = [...aiRecommendations, ...deterministicRecs];

  const { error: rpcError } = await supabase.rpc("replace_strategy_recommendations", {
    _page_id: page.id,
    _recommendations: JSON.stringify(
      allRecs.map((r) => ({
        recommendation_type: r.recommendation_type,
        recommendation_text: r.recommendation_text,
        reasoning: r.reasoning,
        priority: r.priority,
        related_content: r.related_content ?? [],
      })),
    ),
    _prompt_version: PROMPT_VERSION,
    _strategy_version: STRATEGY_VERSION,
  });
  if (rpcError) throw rpcError;

  return `Generated ${aiRecommendations.length} AI + ${deterministicRecs.length} deterministic recommendations.`;
}
