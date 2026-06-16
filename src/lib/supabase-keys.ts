export type SupabaseKeyKind = "anon" | "service" | "unknown";

export function classifySupabaseKey(raw: string): SupabaseKeyKind {
  const key = raw.trim();
  if (!key) return "unknown";
  if (key.startsWith("sb_publishable_")) return "anon";
  if (key.startsWith("sb_secret_")) return "service";

  const parts = key.split(".");
  if (parts.length !== 3) return "unknown";

  try {
    const json = JSON.parse(decodeBase64Url(parts[1])) as { role?: string };
    if (json.role === "anon") return "anon";
    if (json.role === "service_role") return "service";
  } catch {
    return "unknown";
  }

  return "unknown";
}

export function isJwtSupabaseKey(raw: string): boolean {
  return /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(raw.trim());
}

export function supabaseAuthHeaders(raw: string): Record<string, string> {
  const key = raw.trim();
  const headers: Record<string, string> = { apikey: key };
  if (isJwtSupabaseKey(key)) headers.authorization = `Bearer ${key}`;
  return headers;
}

function decodeBase64Url(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
  if (typeof atob === "function") return atob(padded);
  return "";
}