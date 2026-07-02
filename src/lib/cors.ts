import process from "node:process";

const ALLOWED_ORIGINS = new Set<string>([
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.SITE_URL ? [process.env.SITE_URL] : []),
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
]);

const STATIC_HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-supabase-url, x-supabase-anon-key",
  "Access-Control-Max-Age": "86400",
} as const;

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "x-xss-protection": "1; mode=block",
} as const;

export function getCorsHeaders(request?: Request): Record<string, string> {
  const origin = request?.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
      ...STATIC_HEADERS,
      ...SECURITY_HEADERS,
    };
  }
  // Fallback: if no Origin header (same-origin request) or origin not in allowlist,
  // omit Access-Control-Allow-Origin so the browser enforces same-origin.
  return {
    ...STATIC_HEADERS,
    ...SECURITY_HEADERS,
  };
}
