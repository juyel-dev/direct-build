import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function validatePat(pat: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.supabase.com/v1/projects?limit=1", {
      headers: { Authorization: `Bearer ${pat}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST" }, 405);

  const auth = request.headers.get("authorization") ?? "";
  const pat = auth.replace(/^Bearer\s+/i, "").trim();
  if (!pat) {
    return json({ error: "Supabase PAT required in Authorization header" }, 401);
  }
  if (!await validatePat(pat)) {
    return json({ error: "Invalid or expired Supabase PAT. Verify your Personal Access Token in Supabase Dashboard → Settings → API." }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { command, payload } = body as { command?: string; payload?: Record<string, unknown> };
  if (!command) return json({ error: "Missing command" }, 400);

  try {
    let result: unknown;
    switch (command) {
      case "list_buckets": {
        const { data, error } = await supabase.storage.listBuckets();
        if (error) throw error;
        result = data;
        break;
      }
      case "create_bucket": {
        const { name, isPublic } = payload ?? {};
        if (!name || typeof name !== "string") return json({ error: "Missing bucket name" }, 400);
        const { data, error } = await supabase.storage.createBucket(name, {
          public: isPublic === true,
        });
        if (error) throw error;
        result = data;
        break;
      }
      case "run_sql": {
        const { query, params } = payload ?? {};
        if (!query || typeof query !== "string") return json({ error: "Missing query" }, 400);
        const { data, error } = await supabase.rpc("exec_sql", {
          query_text: query,
          query_params: Array.isArray(params) ? params : [],
        });
        if (error) throw error;
        result = data;
        break;
      }
      case "verify": {
        const { error } = await supabase.from("_migrations").select("id").limit(1).maybeSingle();
        if (error) throw error;
        result = { ok: true, migrations_accessible: true };
        break;
      }
      default:
        return json({ error: `Unknown command: ${command}` }, 400);
    }
    return json({ ok: true, result });
  } catch (error) {
    return json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
