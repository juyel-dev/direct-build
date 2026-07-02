import { proxyFetch } from "../../lib/proxy-fetch";
import { BaseService } from "../base";
import { ExternalServiceError } from "../../errors";

export type LlmConfig = {
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

    const r = await proxyFetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: options.systemPrompt || "You are a social media content writer. Return only the post caption." },
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
}

function extractJson(s: string): string {
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  return first >= 0 && last > first ? s.slice(first, last + 1) : s;
}
