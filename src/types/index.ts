export type Json = Record<string, unknown>;

export type Page = {
  id: string;
  fb_page_id: string | null;
  fb_page_name: string;
  default_brand_voice: string | null;
  default_image_style: string | null;
  default_posting_windows: { hour: number; minute: number }[] | null;
  posting_mode: PostingMode;
  max_posts_per_day: number;
  ai_overrides: Json;
  prompt_overrides: Json;
  status: PageStatus;
  created_at: string;
};

export type PostingMode = "manual" | "hybrid" | "full_auto";
export type PageStatus = "active" | "inactive";

export type Brief = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string | null;
  caption: string | null;
  hashtags: string[] | null;
  image_prompt: string | null;
  image_url: string | null;
  storage_image_path: string | null;
  image_stored_at: string | null;
  storage_image_pinned: boolean;
  hook: string | null;
  cta: string | null;
  predicted_engagement_score: number | null;
  approved_at: string | null;
  status: BriefStatus;
  created_at: string;
  updated_at: string;
};

export type BriefStatus = "draft" | "approved" | "scheduled" | "published" | "skipped" | "failed";

export type Post = {
  id: string;
  page_id: string;
  content_brief_id: string | null;
  fb_post_id: string | null;
  fb_permalink_url: string | null;
  idempotency_key: string;
  status: PostStatus;
  published_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type PostStatus = "pending" | "published" | "failed";

export type EngagementSnapshot = {
  id: string;
  post_id: string;
  captured_at: string;
  likes: number;
  comments: number;
  shares: number;
  reactions: Json;
  reach: number;
  impressions: number;
};

export type Job = {
  id: string;
  page_id: string | null;
  kind: string;
  payload: Json;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  priority: number;
  scheduled_at: string;
  lease_expires_at: string | null;
  locked_by: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  idempotency_key: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type JobStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal"
  | "dead_letter";

export type AiUsage = {
  id: string;
  page_id: string | null;
  job_id: string | null;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  called_at: string;
};

export type SystemEvent = {
  id: string;
  severity: "debug" | "info" | "warn" | "error";
  category: string;
  message: string;
  metadata: Json;
  created_at: string;
};

export type StrategyInsight = {
  page_id: string;
  window_days: number;
  best_posting_hour: number | null;
  best_topics: string[];
  avg_engagement_rate: number | null;
  computed_at: string;
};

export type StrategyRecommendation = {
  id: string;
  page_id: string;
  recommendation_type: string;
  recommendation_text: string;
  reasoning: string;
  priority: number;
  related_content: Json;
  generated_at: string;
  status: "active" | "dismissed" | "applied";
  strategy_version?: string;
  prompt_version?: string;
};

export type BrandMemory = {
  id: string;
  page_id: string;
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
  brand_personality: string;
  content_pillars: string[];
  storytelling_style: string;
  strengths_weaknesses: Json;
  llm_analyzed_at: string | null;
  confidence_scores: Record<string, number>;
  sources: Record<string, string>;
  auto_extracted_at: string | null;
  manually_edited_at: string | null;
  created_at: string;
  updated_at: string;
};
