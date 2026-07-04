import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "./base";
import { StrategyRepository } from "../repositories/strategy-repository";
import { BrandMemoryService } from "./brand-memory.service";
import { PostRepository } from "../repositories/post-repository";
import { proxyFetch } from "../lib/proxy-fetch";
import type { StrategyRecommendation, BrandMemory } from "../types";

export type LlmConfig = {
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type PostWithMetrics = {
  content_briefs?: { topic?: string; caption?: string; hashtags?: string[]; predicted_engagement_score?: number | null };
  engagement_snapshots?: Array<{ likes?: number; comments?: number; shares?: number; captured_at?: string }>;
  published_at?: string;
};

export type ScoredPost = {
  topic: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  score: number;
  published_at?: string;
};

export type AnalysisPrompt = {
  task: string;
  brand: string;
  strategy_insights: {
    best_posting_hour: number | null;
    best_topics: string[];
    avg_engagement_rate: number | null;
    average_post_score: number;
  };
  top_performing_posts: Array<{ topic: string; caption: string; likes: number; comments: number; shares: number; score: number }>;
  underperforming_posts: Array<{ topic: string; caption: string; score: number }>;
  requirements: string[];
};

export type RawRecommendation = {
  recommendation_type?: unknown;
  recommendation_text?: unknown;
  reasoning?: unknown;
  priority?: unknown;
  related_content?: unknown;
};

export type ValidRecommendation = {
  recommendation_type: string;
  recommendation_text: string;
  reasoning: string;
  priority: number;
  related_content?: Array<{ type: string; text: string }>;
};

export function normalizeRecommendations(raw: unknown[]): ValidRecommendation[] {
  return raw.filter((r): r is ValidRecommendation =>
    r != null &&
    typeof (r as RawRecommendation).recommendation_type === "string" &&
    typeof (r as RawRecommendation).recommendation_text === "string"
  ).map((r) => ({
    recommendation_type: r.recommendation_type,
    recommendation_text: r.recommendation_text,
    reasoning: typeof r.reasoning === "string" ? r.reasoning : "",
    priority: typeof r.priority === "number" ? r.priority : 0,
    related_content: Array.isArray(r.related_content) ? r.related_content : [],
  }));
}

// Mirrors supabase/functions/aurora-worker/index.ts computeQualityFeedback
// Keep both copies in sync when making changes
function computeQualityFeedback(posts: PostWithMetrics[]): string {
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

// Mirrors supabase/functions/aurora-worker/index.ts buildStrategyPrompt
// Keep both copies in sync when making prompt/logic changes
export function buildAnalysisPrompt(
  memory: BrandMemory | null,
  insights: Record<string, unknown>,
  posts: PostWithMetrics[],
): string {
  const scoredPosts = posts
    .map((p) => {
      const snaps = p.engagement_snapshots ?? [];
      const latest = snaps[snaps.length - 1] ?? {};
      const score = (latest.likes ?? 0) + (latest.comments ?? 0) * 2 + (latest.shares ?? 0) * 3;
      return {
        topic: p.content_briefs?.topic ?? "",
        caption: (p.content_briefs?.caption ?? "").slice(0, 200),
        likes: latest.likes ?? 0,
        comments: latest.comments ?? 0,
        shares: latest.shares ?? 0,
        score,
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
        memory.brand_descriptors.length ? `Brand identity: ${memory.brand_descriptors.join(", ")}.` : "",
        memory.writing_style_notes ? `Style: ${memory.writing_style_notes}.` : "",
        memory.tone_guidelines ? `Tone: ${memory.tone_guidelines}.` : "",
        memory.effective_hashtags.length ? `Top hashtags: ${memory.effective_hashtags.join(", ")}.` : "",
        memory.avoided_topics.length ? `Avoid: ${memory.avoided_topics.join(", ")}.` : "",
      ].filter(Boolean).join(" ")
    : "No brand memory yet.";

  const hours = scoredPosts
    .filter((p) => p.published_at)
    .map((p) => new Date(p.published_at!).getUTCHours());
  const hourCounts = new Map<number, number>();
  for (const h of hours) hourCounts.set(h, (hourCounts.get(h) ?? 0) + 1);
  const bestHour = Array.from(hourCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const qualityFeedback = computeQualityFeedback(posts);
  const qfLines = qualityFeedback ? qualityFeedback.split("\n") : [];

  return JSON.stringify({
    task: "Analyze this Facebook page's content performance and generate 3-5 strategic recommendations.",
    brand: brandContext,
    strategy_insights: {
      best_posting_hour: insights.best_posting_hour ?? bestHour,
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

export class StrategyService extends BaseService {
  private repo: StrategyRepository;
  private brandMemory: BrandMemoryService;
  private posts: PostRepository;

  constructor(client: SupabaseClient) {
    super("StrategyService");
    this.repo = new StrategyRepository(client);
    this.brandMemory = new BrandMemoryService(client);
    this.posts = new PostRepository(client);
  }

  async loadRecommendations(pageId: string): Promise<StrategyRecommendation[]> {
    return this.repo.findByPage(pageId);
  }

  async analyzePage(pageId: string, llm: LlmConfig): Promise<StrategyRecommendation[]> {
    let memory: BrandMemory | null;
    let insights: {
      best_posting_hour: number | null;
      best_topics: string[];
      avg_engagement_rate: number | null;
    } | null;
    let rawPosts: PostWithMetrics[];
    try {
      [memory, insights, rawPosts] = await Promise.all([
        this.brandMemory.load(pageId),
        this.repo.loadInsights(pageId),
        this.loadPostHistory(pageId),
      ]);
    } catch (e) {
      this.log("error", "Failed to load data for strategy analysis", {
        error: e instanceof Error ? e.message : String(e),
        page_id: pageId,
      });
      const existing = await this.repo.findByPage(pageId);
      if (existing.length > 0) return existing;
      throw e;
    }

    const existing = await this.repo.findByPage(pageId);

    const prompt = buildAnalysisPrompt(memory, insights, rawPosts);
    let aiRecommendations;
    try {
      aiRecommendations = await this.callLlm(prompt, llm);
    } catch (e) {
      this.log("error", "AI strategy analysis failed, falling back to cached", {
        error: e instanceof Error ? e.message : String(e),
        page_id: pageId,
      });
      if (existing.length > 0) return existing;
      throw e;
    }

    const deterministicRecs = this.computeDeterministicRecs(memory, insights, rawPosts);
    const allRecs = [...aiRecommendations, ...deterministicRecs];

    const batch = allRecs.map((rec) => ({
      page_id: pageId,
      recommendation_type: rec.recommendation_type ?? "content_strategy",
      recommendation_text: rec.recommendation_text ?? "",
      reasoning: rec.reasoning ?? "",
      priority: rec.priority ?? 0,
      related_content: rec.related_content ?? [],
    }));
    try {
      await this.repo.replaceAll(pageId, batch, "2026-07-03-v1", "1.0.0");
    } catch (e) {
      this.log("error", "Failed to persist strategy recommendations", {
        error: e instanceof Error ? e.message : String(e),
        page_id: pageId,
      });
      if (existing.length > 0) return existing;
      throw e;
    }

    return this.repo.findByPage(pageId);
  }

  // Mirrors supabase/functions/aurora-worker/index.ts computeDeterministicRecs
  private computeDeterministicRecs(
    memory: BrandMemory | null,
    insights: Record<string, unknown>,
    posts: PostWithMetrics[],
  ): Array<{ recommendation_type: string; recommendation_text: string; reasoning: string; priority: number; related_content?: unknown[] }> {
    const recs: Array<{ recommendation_type: string; recommendation_text: string; reasoning: string; priority: number; related_content?: unknown[] }> = [];

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
        recommendation_text: "Fewer than 10% of your posts include a call-to-action. Adding CTAs can boost engagement.",
        reasoning: `CTA frequency is ${memory.cta_frequency} across ${posts.length} analyzed posts.`,
        priority: 8,
      });
    } else if (memory?.cta_frequency && memory.cta_frequency === "occasional") {
      recs.push({
        recommendation_type: "deterministic_content",
        recommendation_text: "About a quarter of your posts include a call-to-action. Try increasing CTAs to drive more clicks.",
        reasoning: `CTA frequency is ${memory.cta_frequency}.`,
        priority: 5,
      });
    }

    if (memory?.media_usage_ratio != null && memory.media_usage_ratio < 0.5) {
      recs.push({
        recommendation_type: "deterministic_content",
        recommendation_text: `Only ${Math.round(memory.media_usage_ratio * 100)}% of your posts include images. Photo posts typically get more engagement.`,
        reasoning: `Media usage ratio is ${memory.media_usage_ratio}.`,
        priority: 7,
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

  private async loadPostHistory(pageId: string): Promise<PostWithMetrics[]> {
    const since = new Date(Date.now() - 90 * 86400_000).toISOString();
    return this.posts.findPublishedWithBriefs(pageId, since) as unknown as Promise<PostWithMetrics[]>;
  }

  private async callLlm(
    prompt: string,
    llm: LlmConfig,
  ): Promise<Array<{
    recommendation_type: string;
    recommendation_text: string;
    reasoning: string;
    priority: number;
    related_content?: Array<{ type: string; text: string }>;
  }>> {
    this.log("info", "Calling strategy AI", { model: llm.model, prompt_length: prompt.length });

    const r = await proxyFetch(`${llm.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${llm.apiKey}`,
      },
      body: JSON.stringify({
        model: llm.model,
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

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      this.log("error", "Strategy AI call failed", { status: r.status });
      throw new Error(`Strategy AI call failed (${r.status}): ${body.slice(0, 200)}`);
    }

    const data = await r.json<{ choices?: { message?: { content?: string } }[] }>();
    const content = data.choices?.[0]?.message?.content ?? "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      this.log("warn", "Strategy AI returned invalid JSON", { content: content.slice(0, 200) });
      return [];
    }

    if (!Array.isArray(parsed.recommendations)) {
      this.log("warn", "Strategy AI response missing recommendations array", { keys: Object.keys(parsed) });
      return [];
    }

    const valid = normalizeRecommendations(parsed.recommendations);

    if (valid.length < parsed.recommendations.length) {
      this.log("warn", "Filtered invalid recommendations", {
        total: parsed.recommendations.length,
        valid: valid.length,
      });
    }

    this.log("info", "Strategy AI call succeeded", { recommendations: valid.length });
    return valid;
  }
}
