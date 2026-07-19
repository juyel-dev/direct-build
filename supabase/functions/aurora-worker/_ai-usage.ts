/**
 * LLM token usage extraction and cost estimation/logging.
 *
 * MODEL_PRICING below is current as of July 2026 (sourced from
 * official OpenAI/Anthropic pricing pages, verified via web search
 * during this update -- see commit history for exact sources). Treat
 * any hardcoded pricing table as inherently short-lived: pricing for
 * both providers changed multiple times in just the few months before
 * this update shipped, and it will keep changing. Rather than chase an
 * ever-growing table, unrecognized models now log a visible warning
 * event instead of silently recording $0 -- so a stale table produces
 * a visible gap in system_events, not a confidently-wrong number on
 * the cost dashboard. Revisit this table periodically; don't treat its
 * presence as a substitute for that.
 */
import { supabase, log } from "./_core.ts";

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

// USD per 1M tokens: { input, output }. Sourced July 2026 from
// official OpenAI (openai.com/api/pricing) and Anthropic
// (anthropic.com/pricing) pricing pages.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "o4-mini": { input: 1.1, output: 4.4 },
  o3: { input: 2.0, output: 8.0 },
  // Anthropic
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 }, // introductory rate through 2026-08-31
  "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
  "claude-3-5-sonnet": { input: 3.0, output: 15.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  // Common OpenRouter / Groq model (kept from the original table; not
  // independently re-verified this pass, but no evidence it changed)
  "meta-llama/llama-3.3-70b-instruct": { input: 0.59, output: 0.79 },
};

export function estimateCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): number | null {
  // OpenRouter's ":free" suffix marks a genuinely free-tier model variant.
  // Matching it against the base model's paid entry (the previous
  // behavior) mis-priced free usage as paid.
  if (model.endsWith(":free")) return 0;

  const pricing = Object.entries(MODEL_PRICING).find(([key]) => model.startsWith(key))?.[1];
  if (!pricing) return null;
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
  const cost = estimateCost(promptTokens, completionTokens, model);
  if (cost === null) {
    log("warn", "unrecognized_model_pricing", { provider, model });
  }
  await supabase.from("ai_usage").insert({
    page_id: pageId,
    job_id: jobId,
    provider,
    model,
    input_tokens: promptTokens,
    output_tokens: completionTokens,
    // Storing 0 rather than null since estimated_cost_usd is NOT NULL;
    // the log line above is what makes this distinguishable from a
    // genuinely free call, without needing a schema change for that
    // distinction right now.
    estimated_cost_usd: cost ?? 0,
  });
}
