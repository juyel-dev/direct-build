import { BaseRepository } from "./base";
import type { AiUsage } from "../types";

export class UsageRepository extends BaseRepository {
  async findByDateRange(since: string): Promise<AiUsage[]> {
    const { data, error } = await this.client
      .from("ai_usage")
      .select("provider, model, estimated_cost_usd, called_at")
      .gte("called_at", since);
    if (error) this.handleError(error, "usage.findByDateRange");
    return (data ?? []) as AiUsage[];
  }
}
