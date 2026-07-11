export function defaultBaseUrl(providerType: string): string {
  switch (providerType) {
    case "openai": return "https://api.openai.com/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "nvidia": return "https://integrate.api.nvidia.com/v1";
    case "groq": return "https://api.groq.com/openai/v1";
    case "anthropic": return "https://api.anthropic.com/v1";
    case "ollama": return "http://localhost:11434/v1";
    case "lm_studio": return "http://localhost:1234/v1";
    default: return "";
  }
}

export function buildLlmConfig(
  type: string,
  model: string,
  baseUrl: string | undefined,
  apiKey: string,
) {
  return {
    type,
    baseUrl: baseUrl || defaultBaseUrl(type),
    model,
    apiKey,
  };
}
