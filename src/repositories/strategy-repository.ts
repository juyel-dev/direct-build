import { BaseRepository } from "./base";
import type { StrategyRecommendation } from "../types";

export class StrategyRepository extends BaseRepository {
  async findByPage(pageId: string, type?: string): Promise<StrategyRecommendation[]> {
    let query = this.client
      .from("strategy_recommendations")
      .select("*")
      .eq("page_id", pageId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .order("generated_at", { ascending: false });
    if (type) query = query.eq("recommendation_type", type);
    const { data, error } = await query;
    if (error) this.handleError(error, "strategy.findByPage");
    return (data ?? []) as StrategyRecommendation[];
  }

  async insert(rec: {
    page_id: string;
    recommendation_type: string;
    recommendation_text: string;
    reasoning: string;
    priority: number;
    related_content?: unknown[];
  }): Promise<StrategyRecommendation> {
    const { data, error } = await this.client
      .from("strategy_recommendations")
      .insert({
        page_id: rec.page_id,
        recommendation_type: rec.recommendation_type,
        recommendation_text: rec.recommendation_text,
        reasoning: rec.reasoning,
        priority: rec.priority,
        related_content: rec.related_content ?? [],
      })
      .select("*")
      .single();
    if (error) this.handleError(error, "strategy.insert");
    return data as StrategyRecommendation;
  }

  async insertBatch(recs: Array<{
    page_id: string;
    recommendation_type: string;
    recommendation_text: string;
    reasoning: string;
    priority: number;
    related_content?: unknown[];
  }>): Promise<void> {
    if (recs.length === 0) return;
    const { error } = await this.client
      .from("strategy_recommendations")
      .insert(recs.map((r) => ({
        page_id: r.page_id,
        recommendation_type: r.recommendation_type,
        recommendation_text: r.recommendation_text,
        reasoning: r.reasoning,
        priority: r.priority,
        related_content: r.related_content ?? [],
      })));
    if (error) this.handleError(error, "strategy.insertBatch");
  }

  async loadInsights(pageId: string): Promise<{
    best_posting_hour: number | null;
    best_topics: string[];
    avg_engagement_rate: number | null;
  }> {
    const { data, error } = await this.client
      .from("strategy_insights")
      .select("best_posting_hour, best_topics, avg_engagement_rate")
      .eq("page_id", pageId)
      .eq("window_days", 30)
      .maybeSingle();
    if (error) this.handleError(error, "strategy.loadInsights");
    return data ?? { best_posting_hour: null, best_topics: [], avg_engagement_rate: null };
  }

  async dismiss(pageId: string, type: string): Promise<void> {
    const { error } = await this.client
      .from("strategy_recommendations")
      .update({ status: "dismissed" })
      .eq("page_id", pageId)
      .eq("recommendation_type", type)
      .eq("status", "active");
    if (error) this.handleError(error, "strategy.dismiss");
  }
}
