import { BaseRepository } from "./base";
import type { SystemEvent } from "../types";
import { CIRCUIT_THRESHOLD, CIRCUIT_COOLDOWN_MS } from "../shared/aurora-shared";

export type AlertCount = {
  total: number;
  hasTokenExpiry: boolean;
  hasDeadLetter: boolean;
};

export class SystemEventRepository extends BaseRepository {
  async findRecentWorkerEvents(limit = 10): Promise<SystemEvent[]> {
    const { data, error } = await this.client
      .from("system_events")
      .select("id, severity, category, message, created_at")
      .eq("category", "worker")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) this.handleError(error, "events.findRecentWorkerEvents");
    return (data ?? []) as SystemEvent[];
  }

  async findWorkerEventsSince(since: Date): Promise<SystemEvent[]> {
    const { data, error } = await this.client
      .from("system_events")
      .select("id, severity, category, message, created_at")
      .eq("category", "worker")
      .gte("created_at", since.toISOString());
    if (error) this.handleError(error, "events.findWorkerEventsSince");
    return (data ?? []) as SystemEvent[];
  }

  async countAlerts(since: Date): Promise<AlertCount> {
    const { data, error } = await this.client
      .from("system_events")
      .select("category")
      .eq("severity", "error")
      .gte("created_at", since.toISOString());
    if (error) this.handleError(error, "events.countAlerts");
    const rows = data ?? [];
    return {
      total: rows.length,
      hasTokenExpiry: rows.some((r) => r.category === "facebook_token_expired"),
      hasDeadLetter: rows.some((r) => r.category === "dead_letter"),
    };
  }

  async countWorkerErrorsSince(since: Date): Promise<number> {
    const { count, error } = await this.client
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .eq("severity", "error")
      .eq("category", "worker")
      .gte("created_at", since.toISOString());
    if (error) this.handleError(error, "events.countWorkerErrorsSince");
    return count ?? 0;
  }

  async isCircuitOpen(): Promise<boolean> {
    const cooldown = new Date(Date.now() - CIRCUIT_COOLDOWN_MS);
    const { count, error } = await this.client
      .from("system_events")
      .select("id", { count: "exact", head: true })
      .like("category", "circuit_%")
      .gte("created_at", cooldown.toISOString());
    if (error) this.handleError(error, "events.isCircuitOpen");
    return (count ?? 0) >= CIRCUIT_THRESHOLD;
  }

  async findAlerts(since: Date): Promise<SystemEvent[]> {
    const { data, error } = await this.client
      .from("system_events")
      .select("id, severity, category, message, created_at")
      .eq("severity", "error")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });
    if (error) this.handleError(error, "events.findAlerts");
    return (data ?? []) as SystemEvent[];
  }
}
