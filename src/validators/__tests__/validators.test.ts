import { describe, it, expect } from "vitest";
import {
  SecretsSchema,
  ProvidersSchema,
  BrandSchema,
  ContentBriefSchema,
  PostSchema,
  EngagementSnapshotSchema,
  WorkerStatusSchema,
} from "../index";

describe("SecretsSchema", () => {
  it("validates complete secrets", () => {
    const result = SecretsSchema.safeParse({
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "TEST_ANON_KEY_PLACEHOLDER_012345678901234567890123456789",
      supabaseServiceKey: "TEST_SERVICE_KEY_PLACEHOLDER_0123456789012345678901234",
      supabasePAT: "placeholderPATvalue0123456789012345678901",
      facebookPageToken: "TEST_FB_TOKEN_PLACEHOLDER",
      facebookPageId: "123456789",
      aiApiKey: "TEST_AI_KEY_PLACEHOLDER",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = SecretsSchema.safeParse({ supabaseUrl: "https://project.supabase.co" });
    expect(result.success).toBe(false);
  });

  it("rejects non-URL supabaseUrl", () => {
    const result = SecretsSchema.safeParse({
      supabaseUrl: "not-a-url",
      supabaseAnonKey: "key",
      supabaseServiceKey: "key",
      supabasePAT: "placeholderPATkeyForTestingOnly12345678901",
    });
    expect(result.success).toBe(false);
  });
});

describe("ProvidersSchema", () => {
  it("validates with defaults", () => {
    const result = ProvidersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.llm.type).toBe("openrouter");
      expect(result.data.image.type).toBe("pollinations");
    }
  });

  it("validates custom LLM provider", () => {
    const result = ProvidersSchema.safeParse({
      llm: { type: "openai", model: "gpt-4", baseUrl: "https://api.openai.com/v1" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid LLM type", () => {
    const result = ProvidersSchema.safeParse({ llm: { type: "invalid" } });
    expect(result.success).toBe(false);
  });
});

describe("BrandSchema", () => {
  it("validates complete brand", () => {
    const result = BrandSchema.safeParse({
      brandName: "Acme Corp",
      voice: "Professional",
      audience: "Enterprise",
      topics: ["SaaS", "AI"],
      postingWindows: [{ hour: 9, minute: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty brand", () => {
    const result = BrandSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe("ContentBriefSchema", () => {
  it("validates minimal brief", () => {
    const result = ContentBriefSchema.safeParse({
      page_id: "550e8400-e29b-41d4-a716-446655440000",
      slot_start: "2026-07-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid date", () => {
    const result = ContentBriefSchema.safeParse({
      page_id: "550e8400-e29b-41d4-a716-446655440000",
      slot_start: "not-a-date",
    });
    expect(result.success).toBe(false);
  });

  it("validates complete brief", () => {
    const result = ContentBriefSchema.safeParse({
      page_id: "550e8400-e29b-41d4-a716-446655440000",
      slot_start: "2026-07-01T12:00:00.000Z",
      topic: "AI Trends",
      caption: "Check out the latest AI trends!",
      hashtags: ["#AI", "#tech"],
      status: "draft",
    });
    expect(result.success).toBe(true);
  });
});

describe("PostSchema", () => {
  it("validates published post", () => {
    const result = PostSchema.safeParse({
      id: "post-1",
      page_id: "page-1",
      content_brief_id: "brief-1",
      fb_post_id: null,
      fb_permalink_url: null,
      status: "published",
      published_at: "2026-07-01T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("EngagementSnapshotSchema", () => {
  it("validates engagement data", () => {
    const result = EngagementSnapshotSchema.safeParse({
      post_id: "post-1",
      captured_at: "2026-07-01T12:00:00.000Z",
      likes: 10,
      comments: 5,
      shares: 2,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative values", () => {
    const result = EngagementSnapshotSchema.safeParse({
      post_id: "post-1",
      captured_at: "2026-07-01T12:00:00.000Z",
      likes: -1,
      comments: 0,
      shares: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("WorkerStatusSchema", () => {
  it("validates worker status", () => {
    const result = WorkerStatusSchema.safeParse({
      lastRun: "2026-07-01T12:00:00.000Z",
      todayRuns: 5,
      healthy: true,
    });
    expect(result.success).toBe(true);
  });
});
