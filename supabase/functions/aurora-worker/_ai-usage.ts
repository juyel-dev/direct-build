/**
 * LLM token usage extraction and cost estimation/logging.
 *
 * Note: MODEL_PRICING is a hardcoded, incomplete allowlist (silently
 * returns $0 for any model not listed, and mis-prices free-tier model
 * variants like "...:free" by prefix-matching the paid entry). This is
 * a known, separately-tracked limitation to address as part of the
 * future provider/model registry — intentionally not fixed here, since
 * this extraction is meant to preserve existing behavior exactly.
 */
import { supabase } from "./_core.ts";

export type LlmUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export function extractLlmUsage(body: string): LlmUsage {
  try {
    const parsed = JSON.parse(body);
    if (parsed?.usage?.prompt_tokens != null) {
      return {
        prompt_tokens: parsed.usage.prompt_tokens,
        completion_tokens: parsed.usage.completion_tokens,
        total_tokens: parsed.usage.total_tokens,
      };
    }
  } catch {
    /* ignore parse errors */
  }
  return {};
}

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "meta-llama/llama-3.3-70b-instruct": { input: 0.59, output: 0.79 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
};

export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number {
  const pricing = Object.entries(MODEL_PRICING).find(([key]) => model.startsWith(key))?.[1];
  if (!pricing) return 0;
  return (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
}

export async function logUsage(
  pageId: string,
  jobId: string | null,
  provider: string,
  model: string,
  usage: LlmUsage = {},
) {
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  await supabase.from("ai_usage").insert({
    page_id: pageId,
    job_id: jobId,
    provider,
    model,
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    estimated_cost_usd: estimateCost(promptTokens, completionTokens, model),
  });
}
