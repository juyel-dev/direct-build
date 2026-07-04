import { BaseRepository, type QueryOptions, type PaginatedResult } from "./base";
import type { EngagementSnapshot } from "../types";

export class EngagementRepository extends BaseRepository {
  async findRecent(limit = 100): Promise<EngagementSnapshot[]> {
    const { data, error } = await this.client
      .from("engagement_snapshots")
      .select("likes, comments, shares")
      .order("captured_at", { ascending: false })
      .limit(limit);
    if (error) this.handleError(error, "engagement.findRecent");
    return (data ?? []) as unknown as EngagementSnapshot[];
  }

  async findByDateRange(since: string, options?: QueryOptions, until?: string): Promise<EngagementSnapshot[] | PaginatedResult<EngagementSnapshot>> {
    const buildQuery = () => {
      let q = this.client
        .from("engagement_snapshots")
        .select("*")
        .gte("captured_at", since);
      if (until) {
        q = q.lt("captured_at", until);
      }
      return q;
    };

    if (options) {
      return this.withPagination<EngagementSnapshot>(buildQuery, options);
    }

    const { data, error } = await buildQuery().order("captured_at", { ascending: true });
    if (error) this.handleError(error, "engagement.findByDateRange");
    return (data ?? []) as EngagementSnapshot[];
  }

  async getAggregateByPost(postId: string): Promise<{ likes: number; comments: number; shares: number }> {
    const { data, error } = await this.client
      .from("engagement_snapshots")
      .select("likes, comments, shares")
      .eq("post_id", postId);
    if (error) this.handleError(error, "engagement.getAggregateByPost");
    const snaps = (data ?? []) as EngagementSnapshot[];
    return {
      likes: snaps.reduce((a, s) => a + s.likes, 0),
      comments: snaps.reduce((a, s) => a + s.comments, 0),
      shares: snaps.reduce((a, s) => a + s.shares, 0),
    };
  }
}
