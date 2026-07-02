import { BaseRepository } from "./base";
import type { SystemEvent } from "../types";

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
