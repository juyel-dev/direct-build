import { z } from "zod";

export const SupabaseUrlSchema = z
  .string()
  .url()
  .refine((v) => v.includes(".supabase.co"), {
    message: "Must be a supabase.co project URL",
  });

export const AIProviderTypeSchema = z.enum([
  "openai",
  "anthropic",
  "openrouter",
  "nvidia",
  "ollama",
  "lm_studio",
  "groq",
  "custom",
]);

export const ImageProviderTypeSchema = z.enum([
  "replicate",
  "openai_dalle",
  "stability",
  "pollinations",
  "custom_http",
]);

export const SecretsSchema = z.object({
  supabaseUrl: SupabaseUrlSchema,
  supabaseAnonKey: z.string().min(20),
  supabaseServiceKey: z.string().min(20),
  supabasePAT: z.string().min(20),
  facebookPageToken: z.string().min(10).optional().or(z.literal("")),
  facebookPageId: z.string().min(1).optional().or(z.literal("")),
  aiApiKey: z.string().optional().or(z.literal("")),
  imageApiKey: z.string().optional().or(z.literal("")),
});

export const ProvidersSchema = z.object({
  llm: z.object({
    type: AIProviderTypeSchema.default("openrouter"),
    baseUrl: z.string().url().optional().or(z.literal("")),
    model: z.string().min(1).default("gpt-4o"),
  }).default({}),
  image: z.object({
    type: ImageProviderTypeSchema.default("pollinations"),
    baseUrl: z.string().url().optional().or(z.literal("")),
    model: z.string().min(1).default("flux"),
  }).default({}),
});

export const PostingWindowSchema = z.object({
  hour: z.number().min(0).max(23),
  minute: z.number().min(0).max(59),
});

export const BrandSchema = z.object({
  brandName: z.string().default(""),
  voice: z.string().default(""),
  audience: z.string().default(""),
  topics: z.array(z.string()).default([]),
  postingWindows: z.array(PostingWindowSchema).default([
    { hour: 9, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 18, minute: 0 },
  ]),
  postingMode: z
    .enum(["manual", "hybrid", "full_auto"])
    .default("manual"),
  maxPostsPerDay: z.number().min(1).max(10).default(2),
});

export const ContentBriefSchema = z.object({
  page_id: z.string().uuid(),
  slot_start: z.string().datetime(),
  topic: z.string().default(""),
  caption: z.string().default(""),
  hashtags: z.array(z.string()).default([]),
  image_prompt: z.string().default(""),
  image_url: z.string().nullable().default(null),
  storage_image_path: z.string().nullable().default(null),
  image_stored_at: z.string().datetime().nullable().default(null),
  hook: z.string().default(""),
  cta: z.string().default(""),
  prompt_version: z.string().default("unknown"),
  status: z
    .enum(["draft", "approved", "scheduled", "published", "skipped", "failed"])
    .default("draft"),
});

export const PostSchema = z.object({
  id: z.string(),
  page_id: z.string(),
  content_brief_id: z.string().nullable(),
  fb_post_id: z.string().nullable(),
  fb_permalink_url: z.string().url().nullable(),
  status: z.enum(["pending", "published", "failed"]),
  published_at: z.string().datetime().nullable(),
});

export const EngagementSnapshotSchema = z.object({
  post_id: z.string(),
  captured_at: z.string().datetime(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  impressions: z.number().int().nonnegative().default(0),
  reach: z.number().int().nonnegative().default(0),
});

export const WorkerStatusSchema = z.object({
  lastRun: z.string().datetime().nullable(),
  todayRuns: z.number().int().nonnegative(),
  healthy: z.boolean(),
});

export const PageSchema = z.object({
  fb_page_id: z.string().optional(),
  fb_page_name: z.string().min(1),
  default_posting_windows: z.array(PostingWindowSchema),
  posting_mode: z
    .enum(["manual", "hybrid", "full_auto"])
    .default("manual"),
  max_posts_per_day: z.number().min(1).max(10).default(2),
});
