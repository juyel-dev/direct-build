/**
 * Job-lease heartbeat and provider circuit breaker. Kept together since
 * both are cross-cutting reliability concerns consulted throughout the
 * queue/publishing/strategy/analytics modules, not owned by any single
 * feature.
 */
import { supabase, log, messageOf } from "./_core.ts";
import { CIRCUIT_COOLDOWN_MS, CIRCUIT_THRESHOLD } from "./_shared.ts";

export const HEARTBEAT_INTERVAL_MS = 30_000;

export async function heartbeat(jobId: string) {
  const { error } = await supabase
    .from("jobs")
    .update({ lease_expires_at: new Date(Date.now() + 120_000).toISOString() })
    .eq("id", jobId)
    .eq("status", "processing");
  if (error) log("warn", "Heartbeat failed", { job_id: jobId, error: messageOf(error) });
}

export async function isProviderAvailable(provider: string): Promise<boolean> {
  const since = new Date(Date.now() - CIRCUIT_COOLDOWN_MS).toISOString();
  const { data, error } = await supabase
    .from("system_events")
    .select("id")
    .eq("category", `circuit_${provider}`)
    .eq("severity", "error")
    .gte("created_at", since)
    .limit(CIRCUIT_THRESHOLD);
  if (error) {
    log("warn", "Circuit check query failed", { provider, error: messageOf(error) });
    return true;
  }
  const recent = (data ?? []).length;
  if (recent >= CIRCUIT_THRESHOLD) {
    log("warn", "Circuit open — provider in cooldown", { provider, recent_failures: recent });
    return false;
  }
  return true;
}

export async function recordProviderFailure(provider: string, detail: string) {
  log("warn", "Provider failure recorded", { provider, detail });
  await supabase.from("system_events").insert({
    severity: "error",
    category: `circuit_${provider}`,
    message: detail.slice(0, 500),
    metadata: { provider },
  });
}
