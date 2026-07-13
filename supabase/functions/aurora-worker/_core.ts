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
