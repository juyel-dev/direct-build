import { SupabaseClient } from "@supabase/supabase-js";
import { PageRepository } from "../repositories/page-repository";
import { BriefRepository } from "../repositories/brief-repository";
import { PostRepository } from "../repositories/post-repository";
import { EngagementRepository } from "../repositories/engagement-repository";
import { SystemEventRepository } from "../repositories/system-event-repository";
import { JobRepository } from "../repositories/job-repository";
import { BaseService } from "./base";
import type { DashboardBrief, DashboardStats } from "../hooks/useAuroraQuery";
import type { SystemEvent } from "../types";

export class DashboardService extends BaseService {
  private pages: PageRepository;
  private briefs: BriefRepository;
  private posts: PostRepository;
  private engagements: EngagementRepository;
  private events: SystemEventRepository;
  private jobs: JobRepository;

  constructor(client: SupabaseClient) {
    super("DashboardService");
    this.pages = new PageRepository(client);
    this.briefs = new BriefRepository(client);
    this.posts = new PostRepository(client);
    this.engagements = new EngagementRepository(client);
    this.events = new SystemEventRepository(client);
    this.jobs = new JobRepository(client);
  }

  async getDashboardData(): Promise<{ briefs: DashboardBrief[]; stats: DashboardStats; alerts: SystemEvent[] }> {
    const pageId = await this.pages.getActivePageId();
    if (!pageId) {
      return {
        briefs: [],
        alerts: [],
        stats: {
          posts7d: 0,
          briefsPending: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          workerLastRun: null,
          workerTodayRuns: 0,
          health: "healthy",
          workerErrors24h: 0,
          queueDepth: 0,
          circuitOpen: false,
        },
      };
    }

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [briefs, postCount, snaps, events, alerts, workerErrors, circuitOpen, queue] = await Promise.all([
      this.briefs.findNext(pageId, 5),
      this.posts.countPublishedLast7d(),
      this.engagements.findRecent(100),
      this.events.findRecentWorkerEvents(10),
      this.events.findAlerts(last24h),
      this.events.countWorkerErrorsSince(last24h),
      this.events.isCircuitOpen(),
      this.jobs.countQueueDepth(),
    ]);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayRuns = events.filter((e) => new Date(e.created_at) >= todayStart).length;

    const lastRunAgo = events[0]?.created_at ? Date.now() - new Date(events[0].created_at).getTime() : Infinity;
    const noRecentRun = lastRunAgo > 3_600_000;
    const highFailureRate = workerErrors > 3 && events.filter((e) => e.severity !== "error").length < 5;

    let health: DashboardStats["health"];
    if (circuitOpen || noRecentRun || queue.deadLetter > 5) {
      health = "critical";
    } else if (highFailureRate || queue.total > 10 || lastRunAgo > 1_800_000) {
      health = "warning";
    } else {
      health = "healthy";
    }

    const stats: DashboardStats = {
      posts7d: postCount,
      briefsPending: briefs.filter((b) => b.status === "draft").length,
      totalLikes: snaps.reduce((a, s) => a + (s.likes ?? 0), 0),
      totalComments: snaps.reduce((a, s) => a + (s.comments ?? 0), 0),
      totalShares: snaps.reduce((a, s) => a + (s.shares ?? 0), 0),
      workerLastRun: events[0]?.created_at ?? null,
      workerTodayRuns: todayRuns,
      health,
      workerErrors24h: workerErrors,
      queueDepth: queue.total,
      circuitOpen,
    };

    return { briefs: briefs as DashboardBrief[], stats, alerts };
  }
}
