import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "../base";
import { EngagementRepository } from "../../repositories/engagement-repository";
import { PostRepository, type PublishedPostWithMetrics } from "../../repositories/post-repository";
import { UsageRepository } from "../../repositories/usage-repository";
import { BriefRepository } from "../../repositories/brief-repository";
import { format } from "date-fns";
import type { EngagementSnapshot, AiUsage } from "../../types";

export type EngagementSeries = { date: string; likes: number; comments: number; shares: number };
export type TopPost = { topic: string; url: string | null; score: number; caption: string | null; likes: number; comments: number; shares: number; published_at: string | null };
export type CostByProvider = { name: string; value: number };

export class AnalyticsService extends BaseService {
  private engagements: EngagementRepository;
  private posts: PostRepository;
  private usage: UsageRepository;
  private briefs: BriefRepository;

  constructor(client: SupabaseClient) {
    super("AnalyticsService");
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
    const { costByProvider, totalCost } = this.buildCostData(usage);

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
    rawPosts: PublishedPostWithMetrics[],
    rawBriefs: Array<{ id: string; topic: string }>,
  ): TopPost[] {
    const briefMap = new Map(
      rawBriefs.map((b) => [b.id, b.topic]),
    );
    const postIdToBrief = new Map(
      rawPosts.map(
        (p) => [p.id, {
          brief: briefMap.get(p.content_brief_id ?? "") ?? "Untitled",
          url: p.fb_permalink_url,
          caption: p.content_briefs?.[0]?.caption ?? null,
          published_at: p.published_at,
        }],
      ),
    );
    const scoreByPost = new Map<string, { score: number; likes: number; comments: number; shares: number }>();
    for (const s of snaps) {
      const cur = scoreByPost.get(s.post_id) ?? { score: 0, likes: 0, comments: 0, shares: 0 };
      cur.score = cur.score + s.likes + s.comments * 2 + s.shares * 3;
      cur.likes += s.likes;
      cur.comments += s.comments;
      cur.shares += s.shares;
      scoreByPost.set(s.post_id, cur);
    }
    return Array.from(scoreByPost.entries())
      .sort((a, z) => z[1].score - a[1].score)
      .slice(0, 5)
      .map(([pid, agg]) => {
        const meta = postIdToBrief.get(pid);
        return {
          topic: meta?.brief ?? "Unknown",
          url: meta?.url ?? null,
          score: agg.score,
          caption: meta?.caption ?? null,
          likes: agg.likes,
          comments: agg.comments,
          shares: agg.shares,
          published_at: meta?.published_at ?? null,
        };
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
