import { createFileRoute } from "@tanstack/react-router";

/**
 * Generic CORS-bypass proxy.
 *
 * The whole app is "Bring Your Own Backend" — the browser needs to talk to
 * api.supabase.com, OpenAI / OpenRouter / Anthropic / etc, and the Facebook
 * Graph API. None of those allow arbitrary-origin browser fetches with an
 * Authorization header. This route forwards the request server-side so CORS
 * stops mattering.
 *
 * Body: { url: string, method?: string, headers?: Record<string,string>, body?: string }
 * Response: { status, headers, body }   (always 200 from our side; real status
 * is inside the payload so the client can inspect it without `fetch` throwing).
 */

const ALLOWED_HOSTS = new Set([
  "api.supabase.com",
  "graph.facebook.com",
  "api.openai.com",
  "openrouter.ai",
  "api.anthropic.com",
  "integrate.api.nvidia.com",
  "api.groq.com",
  "api.replicate.com",
  "api.stability.ai",
  "image.pollinations.ai",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

interface ProxyReq {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

function hostAllowed(u: URL): boolean {
  if (ALLOWED_HOSTS.has(u.hostname)) return true;
  // Allow any *.supabase.co (user's own project REST/storage) and user-defined
  // self-hosted LLM endpoints are blocked here — they must run on the same
  // origin or expose CORS themselves.
  if (u.hostname.endsWith(".supabase.co")) return true;
  return false;
}

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        let payload: ProxyReq;
        try {
          payload = (await request.json()) as ProxyReq;
        } catch {
          return json({ error: "Invalid JSON body" }, 400);
        }
        if (!payload?.url) return json({ error: "Missing url" }, 400);

        let target: URL;
        try {
          target = new URL(payload.url);
        } catch {
          return json({ error: "Invalid url" }, 400);
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          return json({ error: "Only http(s) allowed" }, 400);
        }
        if (!hostAllowed(target)) {
          return json({ error: `Host not allowed: ${target.hostname}` }, 403);
        }

        const init: RequestInit = {
          method: payload.method ?? "GET",
          headers: payload.headers ?? {},
        };
        if (payload.body !== undefined && init.method !== "GET" && init.method !== "HEAD") {
          init.body = payload.body;
        }

        try {
          const upstream = await fetch(target.toString(), init);
          const text = await upstream.text();
          const headers: Record<string, string> = {};
          upstream.headers.forEach((v, k) => {
            headers[k] = v;
          });
          return json({ status: upstream.status, headers, body: text }, 200);
        } catch (e) {
          return json(
            {
              error: e instanceof Error ? e.message : String(e),
              status: 0,
              body: "",
              headers: {},
            },
            200,
          );
        }
      },
    },
  },
});

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block",
} as const;

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...SECURITY_HEADERS },
  });
}
