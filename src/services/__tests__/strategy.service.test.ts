import { describe, it, expect } from "vitest";

describe("StrategyService logic", () => {
  it("buildAnalysisPrompt includes brand memory context when available", () => {
    const memory = {
      brand_descriptors: ["modern", "trustworthy"],
      writing_style_notes: "Short sentences.",
      tone_guidelines: "Warm and professional.",
      effective_hashtags: ["#tech", "#innovation"],
      avoided_topics: ["politics"],
      audience_profile: { age: "25-45" },
    } as any;

    const insights = {
      best_posting_hour: 10,
      best_topics: ["AI", "automation"],
    };

    const posts: any[] = [];

    const prompt = JSON.parse(buildPrompt(memory, insights, posts));
    expect(prompt.brand).toContain("modern");
    expect(prompt.brand).toContain("trustworthy");
    expect(prompt.brand).toContain("Warm and professional");
    expect(prompt.strategy_insights.best_posting_hour).toBe(10);
  });

  it("buildAnalysisPrompt handles empty brand memory gracefully", () => {
    const prompt = JSON.parse(buildPrompt(null, {}, []));
    expect(prompt.brand).toBe("No brand memory yet.");
    expect(prompt.strategy_insights.average_post_score).toBe(0);
  });

  it("buildAnalysisPrompt computes average score from posts", () => {
    const posts = [
      {
        content_briefs: { topic: "Post 1", caption: "Great post" },
        engagement_snapshots: [{ likes: 10, comments: 5, shares: 2 }],
      },
      {
        content_briefs: { topic: "Post 2", caption: "Another post" },
        engagement_snapshots: [{ likes: 20, comments: 10, shares: 5 }],
      },
    ];

    const prompt = JSON.parse(buildPrompt(null, {}, posts));
    const score1 = 10 + 5 * 2 + 2 * 3;
    const score2 = 20 + 10 * 2 + 5 * 3;
    const avg = Math.round((score1 + score2) / 2);
    expect(prompt.strategy_insights.average_post_score).toBe(avg);
  });

  it("buildAnalysisPrompt ranks top and bottom posts correctly", () => {
    const posts = [
      {
        content_briefs: { topic: "Low", caption: "bad" },
        engagement_snapshots: [{ likes: 1, comments: 0, shares: 0 }],
      },
      {
        content_briefs: { topic: "High", caption: "great" },
        engagement_snapshots: [{ likes: 100, comments: 50, shares: 20 }],
      },
    ];

    const prompt = JSON.parse(buildPrompt(null, {}, posts));
    expect(prompt.top_performing_posts[0].topic).toBe("High");
  });
});

function buildPrompt(
  memory: Record<string, any> | null,
  insights: Record<string, any>,
  posts: any[],
): string {
  const scoredPosts = posts
    .map((p: any) => {
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
        memory.brand_descriptors?.length ? `Brand identity: ${memory.brand_descriptors.join(", ")}.` : "",
        memory.writing_style_notes ? `Style: ${memory.writing_style_notes}.` : "",
        memory.tone_guidelines ? `Tone: ${memory.tone_guidelines}.` : "",
        memory.effective_hashtags?.length ? `Top hashtags: ${memory.effective_hashtags.join(", ")}.` : "",
        memory.avoided_topics?.length ? `Avoid: ${memory.avoided_topics.join(", ")}.` : "",
      ].filter(Boolean).join(" ")
    : "No brand memory yet.";

  return JSON.stringify({
    task: "test",
    brand: brandContext,
    strategy_insights: {
      best_posting_hour: insights.best_posting_hour ?? null,
      best_topics: insights.best_topics ?? [],
      avg_engagement_rate: insights.avg_engagement_rate ?? null,
      average_post_score: avgScore,
    },
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
  });
}
