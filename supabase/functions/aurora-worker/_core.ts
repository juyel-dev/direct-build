/**
 * Foundational runtime layer for the aurora-worker Edge Function:
 * environment configuration, the Supabase service-role client, structured
 * logging, and small cross-cutting utilities every other module needs.
 *
 * This is the first extraction of the worker modularization (previously
 * everything lived in one ~1,950-line index.ts). Feature-specific modules
 * (publishing, queue, strategy, analytics, brand-memory) import from this
 * file rather than each redefining their own copy of the Supabase client,
 * logger, or env config.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

// ─── Shared value types (see src/shared/aurora-shared.ts for the
// canonical status enum and circuit breaker tuning; the structural
// shapes below are Deno-side subsets of src/types/index.ts) ──────────
export type Json = Record<string, unknown>;

export type Page = {
  id: string;
  fb_page_id: string | null;
  fb_page_name: string;
  default_brand_voice: string | null;
  default_posting_windows: { hour: number; minute: number }[] | null;
  posting_mode: "manual" | "hybrid" | "full_auto";
  max_posts_per_day: number;
  prompt_overrides: Json | null;
};

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
  status: string;
};

export type Job = {
  id: string;
  page_id: string | null;
  kind: string;
  payload: Json;
  attempts: number;
  max_attempts: number;
};

export const GRAPH_VERSION = "v21.0";
export const WORKER_NAME = "aurora-worker";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-automation-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function requiredEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}

const supabaseUrl = requiredEnv("FBAI_SUPABASE_URL", "SUPABASE_URL");
const serviceKey = requiredEnv("FBAI_SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY");
export const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Hoist all env reads to module scope — read once per warm invocation
export const CRON_SECRET = Deno.env.get("FBAI_CRON_SECRET");
export const AI_API_KEY = Deno.env.get("FBAI_AI_API_KEY");
export const LLM_PROVIDER = Deno.env.get("FBAI_LLM_PROVIDER") ?? "openrouter";
export const LLM_MODEL = Deno.env.get("FBAI_LLM_MODEL") ?? "meta-llama/llama-3.3-70b-instruct:free";
export const LLM_BASE_URL = Deno.env.get("FBAI_LLM_BASE_URL") || "";
export const FALLBACK_LLM_MODEL = Deno.env.get("FBAI_FALLBACK_LLM_MODEL");
export const IMAGE_PROVIDER = Deno.env.get("FBAI_IMAGE_PROVIDER") ?? "pollinations";
export const IMAGE_MODEL = Deno.env.get("FBAI_IMAGE_MODEL") ?? "flux";
export const IMAGE_API_KEY = Deno.env.get("FBAI_IMAGE_API_KEY");
export const IMAGE_STORAGE_BUCKET = Deno.env.get("FBAI_IMAGE_STORAGE_BUCKET") || "generated-images";
export const PAGE_TOKEN = Deno.env.get("FBAI_FB_PAGE_TOKEN");

export const PROMPT_VERSION = "2026-07-03-v1";
export const STRATEGY_VERSION = "1.0.0";

export const WORKER_TIMEOUT_MS = 50_000;

export const requestId = crypto.randomUUID().slice(0, 8);

export function log(level: string, message: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      l: level,
      w: WORKER_NAME,
      rid: requestId,
      msg: message,
      ...data,
    }),
  );
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
) {
  const { timeout = 30_000, ...fetchOpts } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
}

export async function runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Worker timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "strict-origin-when-cross-origin",
    },
  });
}

export async function event(
  severity: string,
  category: string,
  message: string,
  metadata: Json = {},
) {
  await supabase.from("system_events").insert({ severity, category, message, metadata });
}

export async function loadActivePages(): Promise<Page[]> {
  const { data, error } = await supabase
    .from("pages")
    .select(
      "id, fb_page_id, fb_page_name, default_brand_voice, default_posting_windows, posting_mode, max_posts_per_day, prompt_overrides, status",
    )
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []) as Page[];
}

export function defaultLlmBaseUrl(provider: string) {
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "anthropic") return "https://api.anthropic.com/v1";
  if (provider === "openrouter") return "https://openrouter.ai/api/v1";
  if (provider === "nvidia") return "https://integrate.api.nvidia.com/v1";
  if (provider === "groq") return "https://api.groq.com/openai/v1";
  return "";
}

export type PostWithEngagement = {
  published_at: string | null;
  engagement_snapshots: Array<{
    likes?: number;
    comments?: number;
    shares?: number;
    captured_at?: string;
  }> | null;
  content_briefs: {
    topic?: string | null;
    caption?: string | null;
    predicted_engagement_score?: number | null;
  } | null;
};

export async function loadPostHistoryWithEngagement(
  pageId: string,
  windowDays: number,
): Promise<PostWithEngagement[]> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select(
      "published_at, engagement_snapshots(likes, comments, shares, captured_at), content_briefs(topic, caption, predicted_engagement_score)",
    )
    .eq("page_id", pageId)
    .eq("status", "published")
    .gte("published_at", since)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PostWithEngagement[];
}

export async function loadInsights(pageId: string) {
  const { data } = await supabase
    .from("strategy_insights")
    .select("best_posting_hour, best_topics, avg_engagement_rate, computed_at")
    .eq("page_id", pageId)
    .eq("window_days", 30)
    .maybeSingle();
  return data ?? {};
}

// src/types/index.ts:156 (BrandMemory)
export type BrandMemoryRow = {
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
  brand_personality?: string;
  content_pillars?: string[];
  storytelling_style?: string;
  strengths_weaknesses?: Json;
  llm_analyzed_at?: string | null;
};

export async function loadBrandMemory(pageId: string): Promise<BrandMemoryRow | null> {
  const { data, error } = await supabase
    .from("brand_memory")
    .select(
      "brand_descriptors, audience_profile, writing_style_notes, effective_hashtags, top_content_snippets, tone_guidelines, avoided_topics, brand_personality, content_pillars, storytelling_style, strengths_weaknesses, llm_analyzed_at",
    )
    .eq("page_id", pageId)
    .maybeSingle();
  if (error) {
    log("warn", "Brand memory load failed", { page_id: pageId, error: messageOf(error) });
    return null;
  }
  return data as BrandMemoryRow | null;
}

// Mirrors src/services/strategy.service.ts computeQualityFeedback
// Keep both copies in sync when making changes
export function computeQualityFeedback(posts: PostWithEngagement[]): string {
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
    lines.push(
      `- ${topic}: predicted ${avgPred.toFixed(1)}, actual ${avgAct.toFixed(1)} (${sign}${delta.toFixed(1)} delta)`,
    );
  }
  return lines.length ? `Quality feedback (predicted vs actual):\n${lines.join("\n")}` : "";
}
