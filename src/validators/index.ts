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
    type: AIProviderTypeSchema,
    baseUrl: z.string().url().optional().or(z.literal("")),
    model: z.string().min(1),
  }),
  image: z.object({
    type: ImageProviderTypeSchema,
    baseUrl: z.string().url().optional().or(z.literal("")),
    model: z.string().min(1),
  }),
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
  hook: z.string().default(""),
  cta: z.string().default(""),
  status: z
    .enum(["draft", "approved", "scheduled", "published", "skipped", "failed"])
    .default("draft"),
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
