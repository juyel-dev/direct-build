import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createLogger } from "../../logger";
import { getCorsHeaders } from "../../lib/cors";

const log = createLogger("api/proxy");

/* ─── Rate limiting (in-memory sliding window) ──────────────── */
/* NOTE: In-memory Map resets on every Vercel cold start.
   This is acceptable at current scale (120 req/min per IP has headroom).
   For persistent rate limiting across cold starts, migrate to Vercel KV. */

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

const hitCounts = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf;
  return "127.0.0.1";
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = hitCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    hitCounts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

/* ─── Zod validation ────────────────────────────────────────── */

const ProxyRequestSchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]).default("GET"),
  headers: z.record(z.string()).optional().default({}),
  body: z.string().optional(),
}).strict();

/* ─── Allowlist ─────────────────────────────────────────────── */

const ALLOWED_HOST_EXACT = new Set([
  "graph.facebook.com",
  "api.openai.com",
  "openrouter.ai",
  "api.anthropic.com",
  "integrate.api.nvidia.com",
  "api.groq.com",
  "api.replicate.com",
  "api.stability.ai",
  "image.pollinations.ai",
  "api.supabase.com",
]);

function isHostAllowed(hostname: string): boolean {
  if (ALLOWED_HOST_EXACT.has(hostname)) return true;
  if (hostname.endsWith(".supabase.co")) return true;
  return false;
}

/* ─── SSRF / abuse protection ───────────────────────────────── */

const PRIVATE_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^\[::1\]$/,
  /^\[fc00:/,
  /^\[fe80:/,
];

function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  for (const pattern of PRIVATE_RANGES) {
    if (pattern.test(lower)) return true;
  }
  return false;
}

/* ─── Response size limit ───────────────────────────────────── */

const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB
const UPSTREAM_TIMEOUT_MS = 30_000; // 30s timeout for upstream fetch

/* ─── Route ─────────────────────────────────────────────────── */

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { status: 204, headers: getCorsHeaders(request) }),

      POST: async ({ request }) => {
        const ip = getClientIp(request);

        /* Rate limit check */
        const { allowed } = checkRateLimit(ip);
        if (!allowed) {
          log.warn("Rate limit exceeded", { ip });
          return json({ error: "Too many requests. Try again later." }, 429, request);
        }

        /* Parse & validate */
        let payload: z.infer<typeof ProxyRequestSchema>;
        try {
          const raw = await request.json();
          const parsed = ProxyRequestSchema.safeParse(raw);
          if (!parsed.success) {
            log.warn("Validation failed", { errors: parsed.error.issues.map(i => i.message) });
            return json({ error: "Invalid request", details: parsed.error.issues }, 400, request);
          }
          payload = parsed.data;
        } catch {
          return json({ error: "Invalid JSON body" }, 400, request);
        }

        /* Validate URL */
        let target: URL;
        try { target = new URL(payload.url); } catch {
          return json({ error: "Invalid url" }, 400, request);
        }

        /* Enforce HTTPS */
        if (target.protocol === "http:" && !target.hostname.endsWith(".supabase.co")) {
          return json({ error: "HTTPS required" }, 400, request);
        }

        /* Allowlist */
        if (!isHostAllowed(target.hostname)) {
          log.warn("Blocked host", { hostname: target.hostname, ip });
          return json({ error: `Host not allowed: ${target.hostname}` }, 403, request);
        }

        /* SSRF protection */
        if (isPrivateHost(target.hostname)) {
          log.warn("SSRF blocked", { hostname: target.hostname, ip });
          return json({ error: "Internal hosts not allowed" }, 403, request);
        }

        /* Forward request */
        const init: RequestInit = {
          method: payload.method,
          headers: payload.headers,
        };
        if (payload.body && payload.method !== "GET" && payload.method !== "HEAD") {
          init.body = payload.body;
        }

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
          const upstream = await fetch(target.toString(), { ...init, signal: controller.signal });
          clearTimeout(timeoutId);
          const text = await upstream.text();

          /* Check response size */
          const size = new TextEncoder().encode(text).byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            log.warn("Response too large", { size, hostname: target.hostname });
            return json({
              error: "Upstream response too large",
              status: 0,
              body: "",
              headers: {},
            }, 200, request);
          }

          log.info("Proxied request", {
            method: payload.method,
            hostname: target.hostname,
            status: upstream.status,
            size,
            ip,
          });

          const headers: Record<string, string> = {};
          upstream.headers.forEach((v, k) => { headers[k] = v; });
          return json({ status: upstream.status, headers, body: text }, 200, request);
        } catch (e) {
          log.error("Upstream fetch failed", {
            hostname: target.hostname,
            error: e instanceof Error ? e.message : String(e),
            ip,
          });
          return json({
            error: e instanceof Error ? e.message : String(e),
            status: 0,
            body: "",
            headers: {},
          }, 200, request);
        }
      },
    },
  },
});

function json(data: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...getCorsHeaders(request) },
  });
}
