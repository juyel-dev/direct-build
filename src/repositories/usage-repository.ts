import { BaseRepository } from "./base";
import type { AiUsage } from "../types";

export class UsageRepository extends BaseRepository {
  async findByDateRange(since: string, until?: string): Promise<AiUsage[]> {
    let q = this.client
      .from("ai_usage")
      .select("provider, model, estimated_cost_usd, called_at")
      .gte("called_at", since);
    if (until) {
      q = q.lt("called_at", until);
    }
    const { data, error } = await q;
    if (error) this.handleError(error, "usage.findByDateRange");
    return (data ?? []) as AiUsage[];
  }
}
