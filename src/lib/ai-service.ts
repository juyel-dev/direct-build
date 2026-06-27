import { proxyFetch } from "./proxy-fetch";
import { loadProviders, loadSecrets, getSessionPassphrase, type Providers } from "./config-store";

/**
 * Unified AI service for text generation and image generation.
 * Supports OpenAI, OpenRouter, Groq, Anthropic, and custom providers.
 */

export interface GenerateTextOptions {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

async function getApiKey(): Promise<string> {
  const pass = getSessionPassphrase();
  const secrets = pass ? await loadSecrets(pass) : null;
  return secrets?.aiApiKey || "";
}

/**
 * Generate text using the configured LLM provider.
 */
export async function generateText(
  options: GenerateTextOptions,
  providers?: Providers,
): Promise<string> {
  const p = providers ?? loadProviders();
  const baseUrl = (p.llm.baseUrl || "").replace(/\/+$/, "");
  const apiKey = await getApiKey();

  if (!baseUrl) throw new Error("No LLM base URL configured");
  if (!apiKey) throw new Error("No AI API key configured. Add one in Settings.");

  const r = await proxyFetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: p.llm.model,
      messages: [
        { role: "system", content: options.systemPrompt || "You are a helpful assistant." },
        { role: "user", content: options.prompt },
      ],
      temperature: options.temperature ?? 0.75,
      max_tokens: options.maxTokens ?? 1000,
    }),
  });

  if (!r.ok) throw new Error(`LLM request failed (${r.status})`);
  const data = await r.json<{ choices?: { message?: { content?: string } }[] }>();
  return data.choices?.[0]?.message?.content?.trim() || "";
}

/**
 * Generate an image URL using the configured image provider.
 * Returns a URL that can be used directly in img tags.
 */
export async function generateImageUrl(
  prompt: string,
  providers?: Providers,
): Promise<string | null> {
  const p = providers ?? loadProviders();
  const { type, model } = p.image;

  if (type === "pollinations") {
    const encoded = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encoded}?model=${model || "flux"}&nologo=true&width=1024&height=1024`;
  }

  if (type === "openai_dalle") {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("No AI API key configured");
    const r = await proxyFetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "dall-e-3",
        prompt,
        size: "1024x1024",
        n: 1,
      }),
    });
    if (!r.ok) throw new Error(`Image API failed (${r.status})`);
    const data = await r.json<{ data?: { url?: string }[] }>();
    return data.data?.[0]?.url ?? null;
  }

  if (type === "stability") {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error("No AI API key configured");
    const r = await proxyFetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 1024,
        width: 1024,
        steps: 30,
      }),
    });
    if (!r.ok) throw new Error(`Stability API failed (${r.status})`);
    const data = await r.json<{ artifacts?: { base64?: string }[] }>();
    const b64 = data.artifacts?.[0]?.base64;
    if (b64) return `data:image/png;base64,${b64}`;
    return null;
  }

  // Fallback: pollinations
  const encoded = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encoded}?model=flux&nologo=true`;
}
