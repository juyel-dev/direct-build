/**
 * Client-side helper that POSTs to our /api/proxy endpoint and returns a
 * `Response`-like object. Use this instead of `fetch` for any third-party host
 * (Supabase Management API, OpenAI/OpenRouter/Anthropic, Facebook Graph, etc.)
 * because those endpoints do not allow direct browser CORS.
 */

export interface ProxyResponse {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  text: () => Promise<string>;
  json: <T = unknown>() => Promise<T>;
}

export async function proxyFetch(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<ProxyResponse> {
  const r = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      method: init.method ?? "GET",
      headers: init.headers ?? {},
      body: init.body,
    }),
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`Proxy ${r.status}: ${errText.slice(0, 200)}`);
  }
  const payload = (await r.json()) as {
    status: number;
    headers: Record<string, string>;
    body: string;
    error?: string;
  };
  if (payload.error && payload.status === 0) {
    throw new Error(`Network: ${payload.error}`);
  }
  return {
    ok: payload.status >= 200 && payload.status < 300,
    status: payload.status,
    headers: payload.headers ?? {},
    text: async () => payload.body,
    json: async <T,>() => JSON.parse(payload.body) as T,
  };
}
