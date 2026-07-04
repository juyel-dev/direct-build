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
export type WoWComparison = { likes: number; comments: number; shares: number; cost: number };
export type GrowthTrend = { direction: "up" | "down" | "flat"; pct: number };

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
    const now = Date.now();
    const periodMs = days * 86400_000;
    const since = new Date(now - periodMs).toISOString();
    const prevSince = new Date(now - 2 * periodMs).toISOString();

    const [[rawSnaps, rawPrevSnaps], posts, briefTopics, usage, prevUsage] = await Promise.all([
      (async () => {
        const [cur, prev] = await Promise.all([
          this.engagements.findByDateRange(since),
          this.engagements.findByDateRange(prevSince, undefined, since),
        ]);
        return [cur, prev] as const;
      })(),
      this.posts.findPublishedWithMetrics(since),
      this.briefs.findBriefTopics(),
      this.usage.findByDateRange(since),
      this.usage.findByDateRange(prevSince, since),
    ]);
    const snaps = (Array.isArray(rawSnaps) ? rawSnaps : []) as EngagementSnapshot[];
    const prevSnaps = (Array.isArray(rawPrevSnaps) ? rawPrevSnaps : []) as EngagementSnapshot[];

    const series = this.buildEngagementSeries(snaps);
    const topPosts = this.buildTopPosts(snaps, posts, briefTopics);
    const { costByProvider, totalCost } = this.buildCostData(usage);
    const prevCost = this.buildCostData(prevUsage).totalCost;
    const wow = this.buildWoWComparison(snaps, prevSnaps, totalCost, prevCost);
    const growth = this.buildGrowthTrend(snaps);

    return { series, topPosts, costByProvider, totalCost, wow, growth };
  }

  private buildGrowthTrend(snaps: EngagementSnapshot[]): GrowthTrend {
    const sorted = [...snaps].sort((a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime());
    const mid = Math.floor(sorted.length / 2);
    if (mid === 0) return { direction: "flat", pct: 0 };
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const sum = (arr: EngagementSnapshot[]) => arr.reduce((a, s) => a + s.likes + s.comments + s.shares, 0);
    const firstTotal = sum(firstHalf);
    const secondTotal = sum(secondHalf);
    if (firstTotal === 0) return { direction: secondTotal > 0 ? "up" : "flat", pct: secondTotal > 0 ? 100 : 0 };
    const pct = Math.round(((secondTotal - firstTotal) / firstTotal) * 100);
    return { direction: pct > 5 ? "up" : pct < -5 ? "down" : "flat", pct };
  }

  private buildWoWComparison(
    curSnaps: EngagementSnapshot[],
    prevSnaps: EngagementSnapshot[],
    curCost: number,
    prevCost: number,
  ): WoWComparison {
    const sum = (snaps: EngagementSnapshot[]) => snaps.reduce(
      (a, s) => ({ likes: a.likes + s.likes, comments: a.comments + s.comments, shares: a.shares + s.shares }),
      { likes: 0, comments: 0, shares: 0 },
    );
    const cur = sum(curSnaps);
    const prev = sum(prevSnaps);
    const delta = (cur: number, prev: number) => prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);
    return {
      likes: delta(cur.likes, prev.likes),
      comments: delta(cur.comments, prev.comments),
      shares: delta(cur.shares, prev.shares),
      cost: delta(curCost, prevCost),
    };
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
