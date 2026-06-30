import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "../base";
import { EngagementRepository } from "../../repositories/engagement-repository";
import { PostRepository } from "../../repositories/post-repository";
import { UsageRepository } from "../../repositories/usage-repository";
import { BriefRepository } from "../../repositories/brief-repository";
import { format } from "date-fns";
import type { EngagementSnapshot, AiUsage } from "../../types";

export type EngagementSeries = { date: string; likes: number; comments: number; shares: number };
export type TopPost = { topic: string; url: string | null; score: number };
export type CostByProvider = { name: string; value: number };

export class AnalyticsService extends BaseService {
  private readonly _client: SupabaseClient;
  private engagements: EngagementRepository;
  private posts: PostRepository;
  private usage: UsageRepository;
  private briefs: BriefRepository;

  constructor(client: SupabaseClient) {
    super("AnalyticsService");
    this._client = client;
    this.engagements = new EngagementRepository(client);
    this.posts = new PostRepository(client);
    this.usage = new UsageRepository(client);
    this.briefs = new BriefRepository(client);
  }

  async getAnalytics(days: number = 30) {
    const since = new Date(Date.now() - days * 86400_000).toISOString();

    const [snaps, posts, briefTopics, usage] = await Promise.all([
      this.engagements.findByDateRange(since),
      this.posts.findPublishedWithMetrics(since),
      this.briefs.findBriefTopics(),
      this.usage.findByDateRange(since),
    ]);

    const snapData = (Array.isArray(snaps) ? snaps : []) as EngagementSnapshot[];
    const series = this.buildEngagementSeries(snapData);
    const topPosts = this.buildTopPosts(snapData, posts, briefTopics);
    const { costByProvider, totalCost } = this.buildCostData(usage as AiUsage[]);

    return { series, topPosts, costByProvider, totalCost };
  }

  private buildEngagementSeries(snaps: EngagementSnapshot[]): EngagementSeries[] {
    const buckets = new Map<string, { likes: number; comments: number; shares: number }>();
    for (const s of snaps) {
      const key = format(new Date(s.captured_at), "MMM d");
      const cur = buckets.get(key) ?? { likes: 0, comments: 0, shares: 0 };
      cur.likes += s.likes;
      cur.comments += s.comments;
      cur.shares += s.shares;
      buckets.set(key, cur);
    }
    return Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));
  }

  private buildTopPosts(
    snaps: EngagementSnapshot[],
    rawPosts: any[],
    rawBriefs: any[],
  ): TopPost[] {
    const briefMap = new Map(
      rawBriefs.map((b: { id: string; topic: string }) => [b.id, b.topic]),
    );
    const postIdToBrief = new Map(
      (rawPosts as Array<{ id: string; content_brief_id: string | null; fb_permalink_url: string | null }>).map(
        (p) => [p.id, { brief: briefMap.get(p.content_brief_id ?? "") ?? "Untitled", url: p.fb_permalink_url }],
      ),
    );
    const scoreByPost = new Map<string, number>();
    for (const s of snaps) {
      scoreByPost.set(
        s.post_id,
        (scoreByPost.get(s.post_id) ?? 0) + s.likes + s.comments * 2 + s.shares * 3,
      );
    }
    return Array.from(scoreByPost.entries())
      .sort((a, z) => z[1] - a[1])
      .slice(0, 5)
      .map(([pid, score]) => {
        const meta = postIdToBrief.get(pid);
        return { topic: meta?.brief ?? "Unknown", url: meta?.url ?? null, score };
      });
  }

  private buildCostData(usage: AiUsage[]) {
    const costMap = new Map<string, number>();
    let totalCost = 0;
    for (const u of usage) {
      costMap.set(u.provider, (costMap.get(u.provider) ?? 0) + Number(u.estimated_cost_usd ?? 0));
      totalCost += Number(u.estimated_cost_usd ?? 0);
    }
    const costByProvider = Array.from(costMap.entries()).map(([name, value]) => ({ name, value }));
    return { costByProvider, totalCost };
  }
}
