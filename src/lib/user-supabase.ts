import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSessionPassphrase, loadSecrets } from "./config-store";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export async function getUserSupabase(): Promise<SupabaseClient | null> {
  const pass = getSessionPassphrase();
  if (!pass) return null;
  const secrets = await loadSecrets(pass);
  if (!secrets) return null;
  if (cached && cached.url === secrets.supabaseUrl && cached.key === secrets.supabaseAnonKey) {
    return cached.client;
  }
  const client = createClient(secrets.supabaseUrl, secrets.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cached = { url: secrets.supabaseUrl, key: secrets.supabaseAnonKey, client };
  return client;
}

export function invalidateUserSupabase() {
  cached = null;
}
