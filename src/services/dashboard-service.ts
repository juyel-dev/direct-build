import { SupabaseClient } from "@supabase/supabase-js";
import { PageRepository } from "../repositories/page-repository";
import { BriefRepository } from "../repositories/brief-repository";
import { PostRepository } from "../repositories/post-repository";
import { EngagementRepository } from "../repositories/engagement-repository";
import { SystemEventRepository } from "../repositories/system-event-repository";
import { BaseService } from "./base";
import type { DashboardBrief, DashboardStats } from "../hooks/useAuroraQuery";

export class DashboardService extends BaseService {
  private pages: PageRepository;
  private briefs: BriefRepository;
  private posts: PostRepository;
  private engagements: EngagementRepository;
  private events: SystemEventRepository;

  constructor(client: SupabaseClient) {
    super("DashboardService");
    this.pages = new PageRepository(client);
    this.briefs = new BriefRepository(client);
    this.posts = new PostRepository(client);
    this.engagements = new EngagementRepository(client);
    this.events = new SystemEventRepository(client);
  }

  async getDashboardData(): Promise<{ briefs: DashboardBrief[]; stats: DashboardStats }> {
    const pageId = await this.pages.getActivePageId();
    if (!pageId) {
      return {
        briefs: [],
        stats: {
          posts7d: 0,
          briefsPending: 0,
          totalLikes: 0,
          totalComments: 0,
          totalShares: 0,
          workerLastRun: null,
          workerTodayRuns: 0,
        },
      };
    }

    const [briefs, postCount, snaps, events] = await Promise.all([
      this.briefs.findNext(pageId, 5),
      this.posts.countPublishedLast7d(),
      this.engagements.findRecent(100),
      this.events.findRecentWorkerEvents(10),
    ]);

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const todayRuns = events.filter((e) => new Date(e.created_at) >= todayStart).length;

    const stats: DashboardStats = {
      posts7d: postCount,
      briefsPending: briefs.filter((b) => b.status === "draft").length,
      totalLikes: snaps.reduce((a, s) => a + (s.likes ?? 0), 0),
      totalComments: snaps.reduce((a, s) => a + (s.comments ?? 0), 0),
      totalShares: snaps.reduce((a, s) => a + (s.shares ?? 0), 0),
      workerLastRun: events[0]?.created_at ?? null,
      workerTodayRuns: todayRuns,
    };

    return { briefs: briefs as DashboardBrief[], stats };
  }
}
