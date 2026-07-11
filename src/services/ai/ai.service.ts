import { proxyFetch } from "../../lib/proxy-fetch";
import { BaseService } from "../base";
import { ExternalServiceError } from "../../errors";

export type LlmConfig = {
  type?: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type ImageConfig = {
  provider: string;
  model: string;
  apiKey?: string;
};

export type GenerateCaptionOptions = {
  topic: string;
  brandVoice?: string;
  systemPrompt?: string;
  maxTokens?: number;
};

export type GenerateImageOptions = {
  prompt: string;
  model?: string;
};

export class AiService extends BaseService {
  constructor() {
    super("AiService");
  }

  async generateCaption(config: LlmConfig, options: GenerateCaptionOptions): Promise<string> {
    const prompt = `Write a Facebook post caption about: ${options.topic}. Brand voice: ${options.brandVoice || "friendly and professional"}. Keep it under 280 characters, engaging, and non-spammy. Return ONLY the caption text, no quotes or labels.`;
    const systemPrompt = options.systemPrompt || "You are a social media content writer. Return only the post caption.";

    if (config.type === "anthropic") {
      const r = await proxyFetch(`${config.baseUrl.replace(/\/+$/, "")}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          system: systemPrompt,
          max_tokens: options.maxTokens ?? 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new ExternalServiceError("LLM", r.status, body.slice(0, 200) || `Anthropic request failed (${r.status})`);
      }
      const data = await r.json<{ content?: { type?: string; text?: string }[] }>();
      return data.content?.find((b) => b.type === "text")?.text?.trim() || "";
    }

    const r = await proxyFetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.75,
        max_tokens: options.maxTokens ?? 300,
      }),
    });

    if (!r.ok) throw new ExternalServiceError("LLM", r.status, `AI request failed (${r.status})`);
    const data = await r.json<{ choices?: { message?: { content?: string } }[] }>();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  async generateCaptionWithJson(config: LlmConfig, options: {
    systemPrompt: string;
    userPrompt: string;
  }): Promise<Record<string, unknown>> {
    if (config.type === "anthropic") {
      const r = await proxyFetch(`${config.baseUrl.replace(/\/+$/, "")}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.model,
          system: `${options.systemPrompt}\n\nRespond with ONLY a single valid JSON object, no other text.`,
          max_tokens: 1024,
          messages: [{ role: "user", content: options.userPrompt }],
        }),
      });
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        throw new ExternalServiceError("LLM", r.status, body.slice(0, 200) || `Anthropic request failed (${r.status})`);
      }
      const j = await r.json<{ content?: { type?: string; text?: string }[] }>();
      const content = j.content?.find((b) => b.type === "text")?.text ?? "{}";
      return JSON.parse(extractJson(content)) as Record<string, unknown>;
    }

    const r = await proxyFetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: options.systemPrompt },
          { role: "user", content: options.userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      const parsed: { error?: { message?: string } } = JSON.parse(body || "{}");
      throw new ExternalServiceError("LLM", r.status, parsed.error?.message ?? body.slice(0, 200));
    }
    const j = await r.json<{ choices?: { message?: { content?: string } }[] }>();
    const content = j.choices?.[0]?.message?.content ?? "{}";
    return JSON.parse(extractJson(content)) as Record<string, unknown>;
  }

  generatePollinationsUrl(prompt: string, model = "flux"): string {
    const encoded = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encoded}?model=${model}&nologo=true&width=1024&height=1024`;
  }

  /**
   * Generate an image using the configured image provider. Returns a URL
   * usable directly in an <img> src (either a remote URL or a data: URI).
   */
  async generateImage(config: ImageConfig, options: GenerateImageOptions): Promise<string | null> {
    const { prompt } = options;
    const model = options.model || config.model;

    if (config.provider === "openai_dalle") {
      if (!config.apiKey) throw new ExternalServiceError("Image", 401, "No image provider API key configured. Add one in Settings.");
      const r = await proxyFetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: model || "dall-e-3",
          prompt,
          size: "1024x1024",
          n: 1,
        }),
      });
      if (!r.ok) throw new ExternalServiceError("Image", r.status, `OpenAI image request failed (${r.status})`);
      const data = await r.json<{ data?: { url?: string }[] }>();
      return data.data?.[0]?.url ?? null;
    }

    if (config.provider === "stability") {
      if (!config.apiKey) throw new ExternalServiceError("Image", 401, "No image provider API key configured. Add one in Settings.");
      const r = await proxyFetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }],
          cfg_scale: 7,
          height: 1024,
          width: 1024,
          steps: 30,
        }),
      });
      if (!r.ok) throw new ExternalServiceError("Image", r.status, `Stability AI request failed (${r.status})`);
      const data = await r.json<{ artifacts?: { base64?: string }[] }>();
      const b64 = data.artifacts?.[0]?.base64;
      return b64 ? `data:image/png;base64,${b64}` : null;
    }

    // Default / "pollinations": no API key required
    return this.generatePollinationsUrl(prompt, model || "flux");
  }
}

function extractJson(s: string): string {
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  return first >= 0 && last > first ? s.slice(first, last + 1) : s;
}
