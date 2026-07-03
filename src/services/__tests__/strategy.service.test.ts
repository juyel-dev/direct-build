import { describe, it, expect } from "vitest";
import { buildAnalysisPrompt, normalizeRecommendations } from "../strategy.service";
import type { BrandMemory } from "@/types";

describe("buildAnalysisPrompt", () => {
  it("includes brand memory context when available", () => {
    const memory: BrandMemory = {
      id: "1",
      page_id: "p1",
      brand_descriptors: ["modern", "trustworthy"],
      writing_style_notes: "Short sentences.",
      tone_guidelines: "Warm and professional.",
      effective_hashtags: ["#tech", "#innovation"],
      avoided_topics: ["politics"],
      audience_profile: {},
      top_content_snippets: [],
      best_posting_days: [],
      caption_length_avg: null,
      emoji_usage: [],
      cta_frequency: "rare",
      media_usage_ratio: null,
      hashtag_count_avg: null,
      brand_personality: "",
      content_pillars: [],
      storytelling_style: "",
      strengths_weaknesses: {},
      llm_analyzed_at: null,
      auto_extracted_at: null,
      manually_edited_at: null,
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    };

    const prompt = JSON.parse(buildAnalysisPrompt(memory, { best_posting_hour: 10 }, []));
    expect(prompt.brand).toContain("modern");
    expect(prompt.brand).toContain("trustworthy");
    expect(prompt.brand).toContain("Warm and professional");
    expect(prompt.strategy_insights.best_posting_hour).toBe(10);
  });

  it("handles empty brand memory gracefully", () => {
    const prompt = JSON.parse(buildAnalysisPrompt(null, {}, []));
    expect(prompt.brand).toBe("No brand memory yet.");
    expect(prompt.strategy_insights.average_post_score).toBe(0);
  });

  it("computes average score from posts", () => {
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

    const prompt = JSON.parse(buildAnalysisPrompt(null, {}, posts));
    const score1 = 10 + 5 * 2 + 2 * 3;
    const score2 = 20 + 10 * 2 + 5 * 3;
    const avg = Math.round((score1 + score2) / 2);
    expect(prompt.strategy_insights.average_post_score).toBe(avg);
  });

  it("ranks top performing posts correctly", () => {
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

    const prompt = JSON.parse(buildAnalysisPrompt(null, {}, posts));
    expect(prompt.top_performing_posts[0].topic).toBe("High");
  });

  it("excludes zero-score posts from underperforming list", () => {
    const posts = [
      {
        content_briefs: { topic: "Zero", caption: "no engagement" },
        engagement_snapshots: [{ likes: 0, comments: 0, shares: 0 }],
      },
      {
        content_briefs: { topic: "Positive", caption: "ok" },
        engagement_snapshots: [{ likes: 5, comments: 0, shares: 0 }],
      },
    ];

    const prompt = JSON.parse(buildAnalysisPrompt(null, {}, posts));
    expect(prompt.underperforming_posts.length).toBe(1);
    expect(prompt.underperforming_posts[0].topic).toBe("Positive");
  });

  it("handles empty post history gracefully", () => {
    const prompt = JSON.parse(buildAnalysisPrompt(null, {}, []));
    expect(prompt.top_performing_posts).toEqual([]);
    expect(prompt.underperforming_posts).toEqual([]);
    expect(prompt.strategy_insights.average_post_score).toBe(0);
    expect(prompt.strategy_insights.best_posting_hour).toBeNull();
  });

  it("handles posts with missing engagement snapshots", () => {
    const posts = [
      { content_briefs: { topic: "No snaps", caption: "" } },
      {
        content_briefs: { topic: "Partial", caption: "" },
        engagement_snapshots: [],
      },
    ];

    const prompt = JSON.parse(buildAnalysisPrompt(null, {}, posts));
    expect(prompt.top_performing_posts.length).toBe(2);
    expect(prompt.top_performing_posts.every((p: any) => p.score === 0)).toBe(true);
  });

  it("builds valid JSON output", () => {
    const prompt = buildAnalysisPrompt(null, { best_topics: ["tech"] }, []);

    expect(() => JSON.parse(prompt)).not.toThrow();
    const parsed = JSON.parse(prompt);
    expect(parsed.task).toBeTruthy();
    expect(parsed.requirements).toBeInstanceOf(Array);
    expect(parsed.strategy_insights).toBeTruthy();
  });
});

describe("normalizeRecommendations", () => {
  it("filters out null items", () => {
    expect(normalizeRecommendations([null, undefined]).length).toBe(0);
  });

  it("filters out items missing recommendation_type", () => {
    const result = normalizeRecommendations([
      { recommendation_text: "text", recommendation_type: undefined },
    ]);
    expect(result.length).toBe(0);
  });

  it("filters out items missing recommendation_text", () => {
    const result = normalizeRecommendations([
      { recommendation_type: "topic", recommendation_text: null },
    ]);
    expect(result.length).toBe(0);
  });

  it("fills defaults for missing optional fields", () => {
    const result = normalizeRecommendations([
      { recommendation_type: "topic", recommendation_text: "Post more" },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].reasoning).toBe("");
    expect(result[0].priority).toBe(0);
    expect(result[0].related_content).toEqual([]);
  });

  it("preserves valid recommendations unchanged", () => {
    const result = normalizeRecommendations([
      {
        recommendation_type: "timing",
        recommendation_text: "Post at 10am",
        reasoning: "Higher engagement",
        priority: 8,
        related_content: [{ type: "example", text: "Last post at 10am got 50 likes" }],
      },
    ]);
    expect(result.length).toBe(1);
    expect(result[0].recommendation_type).toBe("timing");
    expect(result[0].priority).toBe(8);
  });

  it("handles empty array", () => {
    expect(normalizeRecommendations([])).toEqual([]);
  });
});
