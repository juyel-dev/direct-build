import type { Providers, Secrets } from "./config-store";
import { getProject } from "./management-api";
import { proxyFetch } from "./proxy-fetch";
import { projectRefFromUrl } from "./config-store";
import { classifySupabaseKey, isJwtSupabaseKey, supabaseAuthHeaders } from "./supabase-keys";

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

    const r = await proxyFetch(`${base}/rest/v1/`, { headers: supabaseAuthHeaders(key) });
    if (r.status >= 200 && r.status < 400) {
      const serviceNote = secrets.supabaseServiceKey?.trim()
        ? " Service key present but not used for REST anon test."
        : "";
      return { ok: true, detail: `REST reachable with anon/public key (HTTP ${r.status}).${serviceNote}` };
    }
    if (r.status === 401) {
      return {
        ok: false,
        detail: isJwtSupabaseKey(key)
          ? "Bad anon key (401). The JWT was rejected — copy the anon/public key from Supabase Settings → API."
          : "Bad anon key (401). Copy the anon/public (or sb_publishable_…) key from Supabase Settings → API.",
      };
    }
    const body = (await r.text()).slice(0, 160);
    return { ok: false, detail: `HTTP ${r.status} ${body}` };
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
      ? `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}?fields=id,name,category&access_token=${encodeURIComponent(token)}`
      : `https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const r = await proxyFetch(url);
    const j = await r.json<{ id?: string; name?: string; error?: { message: string } }>();
    if (j.error) return { ok: false, detail: j.error.message };
    return { ok: true, detail: `Facebook OK: ${j.name ?? "(no name)"} (${j.id})`, data: j };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
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
