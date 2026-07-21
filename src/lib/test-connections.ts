import type { Providers, Secrets } from "./config-store";
import { getProject, listBuckets } from "./management-api";
import { proxyFetch } from "./proxy-fetch";
import { projectRefFromUrl } from "./config-store";
import { classifySupabaseKey, isJwtSupabaseKey, supabaseAuthHeaders } from "./supabase-keys";
import { DEFAULT_GRAPH_VERSION } from "../shared/aurora-shared";

export interface TestResult {
  ok: boolean;
  detail: string;
  data?: unknown;
}

export async function testSupabaseRest(
  secrets: Pick<Secrets, "supabaseUrl" | "supabaseAnonKey" | "supabaseServiceKey">,
): Promise<TestResult> {
  if (!secrets.supabaseUrl || !secrets.supabaseAnonKey)
    return { ok: false, detail: "Add the URL and anon key first." };
  try {
    const base = secrets.supabaseUrl.replace(/\/+$/, "");
    const key = secrets.supabaseAnonKey.trim();
    const keyKind = classifySupabaseKey(key);

    if (keyKind === "service") {
      return {
        ok: false,
        detail: "Anon field contains a service_role key. Move it to Service role; REST test uses only the anon/public key.",
      };
    }

    const r = await proxyFetch(`${base}/auth/v1/settings`, { headers: supabaseAuthHeaders(key) });
    if (r.status >= 200 && r.status < 400) {
      const serviceNote = secrets.supabaseServiceKey?.trim()
        ? " Service key present but not used for anon test."
        : "";
      return { ok: true, detail: `Anon/public key valid (HTTP ${r.status}).${serviceNote}` };
    }
    if (r.status === 401) {
      return {
        ok: false,
        detail: isJwtSupabaseKey(key)
          ? "Bad anon key (401). The anon JWT was rejected — copy the anon/public key from Supabase Settings → API."
          : "Bad anon key (401). Copy the anon/public (or sb_publishable_…) key from Supabase Settings → API.",
      };
    }
    const body = (await r.text()).slice(0, 160);
    return { ok: false, detail: `HTTP ${r.status} ${body}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function testSupabaseServiceRole(
  secrets: Pick<Secrets, "supabaseUrl" | "supabaseServiceKey">,
): Promise<TestResult> {
  if (!secrets.supabaseUrl || !secrets.supabaseServiceKey) {
    return { ok: false, detail: "Add the URL and service_role key first." };
  }
  const key = secrets.supabaseServiceKey.trim();
  if (classifySupabaseKey(key) === "anon") {
    return { ok: false, detail: "Service role field contains an anon/public key." };
  }
  try {
    const buckets = await listBuckets(secrets.supabaseUrl, key);
    return { ok: true, detail: `Service role works — storage reachable (${buckets.length} buckets).` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}


export async function testManagementApi(secrets: Pick<Secrets, "supabaseUrl" | "supabasePAT">): Promise<TestResult> {
  const ref = projectRefFromUrl(secrets.supabaseUrl);
  if (!ref) return { ok: false, detail: "Could not parse project ref from URL." };
  try {
    const p = await getProject(secrets.supabasePAT, ref);
    return { ok: true, detail: `Project: ${p.name} (${p.region}, ${p.status})`, data: p };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function testFacebook(token: string, pageId?: string): Promise<TestResult> {
  if (!token) return { ok: false, detail: "No token provided." };
  try {
    const url = pageId
      ? `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=id,name,category&access_token=${encodeURIComponent(token)}`
      : `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const r = await proxyFetch(url);
    const j = await r.json<{ id?: string; name?: string; error?: { message: string } }>();
    if (j.error) return { ok: false, detail: j.error.message };

    const expiry = await checkTokenExpiry(token);
    const base = `Facebook OK: ${j.name ?? "(no name)"} (${j.id})`;
    return { ok: true, detail: expiry ? `${base} — ${expiry}` : base, data: j };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Checks how long the given token has left via Facebook's debug_token
 * endpoint (a token can inspect itself as both input_token and
 * access_token). Returns a short human-readable warning/status string,
 * or null if the check itself failed (never blocks the main test result
 * on this — expiry info is a bonus, not a requirement).
 */
async function checkTokenExpiry(token: string): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/${DEFAULT_GRAPH_VERSION}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`;
    const r = await proxyFetch(url);
    const j = await r.json<{ data?: { expires_at?: number; data_access_expires_at?: number } }>();
    const expiresAt = j.data?.expires_at;
    if (expiresAt === undefined) return null;
    if (expiresAt === 0) return "token does not expire (long-lived).";

    const msLeft = expiresAt * 1000 - Date.now();
    if (msLeft <= 0) return "⚠ this token has already expired.";
    const hoursLeft = msLeft / 3_600_000;
    if (hoursLeft < 24) {
      return `⚠ expires in ~${Math.max(1, Math.round(hoursLeft))}h — this looks like a short-lived token. See Facebook's Access Token Debugger to exchange it for a long-lived one before automation runs.`;
    }
    const daysLeft = Math.round(hoursLeft / 24);
    return `expires in ~${daysLeft} day${daysLeft === 1 ? "" : "s"}.`;
  } catch {
    return null;
  }
}

function baseUrlFor(p: Providers["llm"]): string {
  if (p.baseUrl) return p.baseUrl.replace(/\/+$/, "");
  switch (p.type) {
    case "openai": return "https://api.openai.com/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "nvidia": return "https://integrate.api.nvidia.com/v1";
    case "groq": return "https://api.groq.com/openai/v1";
    case "anthropic": return "https://api.anthropic.com/v1";
    case "ollama": return "http://localhost:11434/v1";
    case "lm_studio": return "http://localhost:1234/v1";
    case "custom": return "";
  }
}

export async function testLLM(providers: Providers, apiKey: string): Promise<TestResult> {
  const base = baseUrlFor(providers.llm);
  if (!base) return { ok: false, detail: "No base URL configured." };
  try {
    if (providers.llm.type === "anthropic") {
      const r = await proxyFetch(`${base}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: providers.llm.model,
          max_tokens: 16,
          messages: [{ role: "user", content: "Say 'ok' in 1 word." }],
        }),
      });
      const j = await r.json();
      if (!r.ok) return { ok: false, detail: JSON.stringify(j).slice(0, 200) };
      return { ok: true, detail: `Anthropic ${providers.llm.model} responded.` };
    }
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers["authorization"] = `Bearer ${apiKey}`;
    const r = await proxyFetch(`${base}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: providers.llm.model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the single word: ok" }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, detail: (j as { error?: { message?: string } }).error?.message ?? JSON.stringify(j).slice(0, 200) };
    const content = (j as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
    return { ok: true, detail: `${providers.llm.type}/${providers.llm.model} → "${content.slice(0, 40)}"` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}
