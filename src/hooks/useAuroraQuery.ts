import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createUserClient, isClientReady } from "../services/supabase-factory";
import { DashboardService } from "../services/dashboard-service";
import { BriefRepository } from "../repositories/brief-repository";
import { PageRepository } from "../repositories/page-repository";
import { PostRepository } from "../repositories/post-repository";
import { EngagementRepository } from "../repositories/engagement-repository";
import { UsageRepository } from "../repositories/usage-repository";
import { subDays, format } from "date-fns";
import type { Brief, EngagementSnapshot, AiUsage } from "../types";

export type DashboardBrief = {
  id: string;
  slot_start: string;
  topic: string;
  caption: string;
  status: string;
  image_url: string | null;
};

export type DashboardStats = {
  posts7d: number;
  briefsPending: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  workerLastRun: string | null;
  workerTodayRuns: number;
};

async function getRepos() {
  const sb = await createUserClient();
  if (!sb) throw new Error("Could not initialize Supabase client.");
  return {
    briefs: new BriefRepository(sb),
    pages: new PageRepository(sb),
    posts: new PostRepository(sb),
    engagements: new EngagementRepository(sb),
    usage: new UsageRepository(sb),
  };
}

// ─── Dashboard ───────────────────────────────────────────
export function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const sb = await createUserClient();
      if (!sb) throw new Error("Could not initialize Supabase client.");
      const svc = new DashboardService(sb);
      return svc.getDashboardData();
    },
    enabled: isClientReady(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Drafts ──────────────────────────────────────────────
export type Draft = Brief;

export function useDrafts() {
  return useQuery({
    queryKey: ["drafts"],
    queryFn: async () => {
      const repos = await getRepos();
      const [drafts, page] = await Promise.all([
        repos.briefs.findDrafts(),
        repos.pages.findDefault(),
      ]);
      const pageName = page?.fb_page_name ?? "";
      return { drafts: drafts as Draft[], pageName };
    },
    enabled: isClientReady(),
    staleTime: 30_000,
  });
}

export function useApproveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const repos = await getRepos();
      await repos.briefs.approve(draftId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRejectDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const repos = await getRepos();
      await repos.briefs.reject(draftId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useBulkApproveDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftIds: string[]) => {
      const repos = await getRepos();
      await repos.briefs.bulkApprove(draftIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useBulkRejectDrafts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftIds: string[]) => {
      const repos = await getRepos();
      await repos.briefs.bulkReject(draftIds);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drafts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ─── Schedule ────────────────────────────────────────────
export type ScheduleBrief = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  image_url: string | null;
  status: string;
};

export type Page = { id: string; fb_page_name: string };

export function useScheduleData(weekDays: Date[], pageId: string) {
  return useQuery({
    queryKey: ["schedule", pageId, weekDays[0]?.toISOString(), weekDays[6]?.toISOString()],
    queryFn: async () => {
      const sb = await createUserClient();
      if (!sb) return { pages: [], briefs: [] };

      const pageRepo = new PageRepository(sb);
      const briefRepo = new BriefRepository(sb);
      const pages = ((await pageRepo.findDefault())
        ? [{ id: (await pageRepo.findDefault())!.id, fb_page_name: (await pageRepo.findDefault())!.fb_page_name }]
        : []) as Page[];

      const pid = pageId || pages[0]?.id;
      if (!pid) return { pages, briefs: [] };

      const weekStart = weekDays[0].toISOString();
      const weekEnd = new Date(weekDays[6]);
      weekEnd.setDate(weekEnd.getDate() + 1);
      const briefs = await briefRepo.findByPageAndRange(pid, weekStart, weekEnd.toISOString());
      return { pages, briefs: briefs as ScheduleBrief[] };
    },
    enabled: isClientReady(),
    staleTime: 15_000,
  });
}

// ─── Analytics ───────────────────────────────────────────
export type EngagementSnap = {
  post_id: string;
  captured_at: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
};

export type TopPost = { topic: string; url: string | null; score: number };
export type CostByProvider = { name: string; value: number };

export function useAnalyticsData(days: number = 30) {
  return useQuery({
    queryKey: ["analytics", days],
    queryFn: async () => {
      const sb = await createUserClient();
      if (!sb) return { series: [], topPosts: [], costByProvider: [], totalCost: 0 };

      const since = subDays(new Date(), days).toISOString();
      const repos = await getRepos();

      const [snaps, posts, briefs, usage] = await Promise.all([
        repos.engagements.findByDateRange(since),
        repos.posts.findPublishedWithMetrics(since),
        sb.from("content_briefs").select("id, topic"),
        repos.usage.findByDateRange(since),
      ]);

      const snapData = snaps as EngagementSnap[];

      // Engagement series
      const buckets = new Map<string, { likes: number; comments: number; shares: number }>();
      for (const s of snapData) {
        const key = format(new Date(s.captured_at), "MMM d");
        const cur = buckets.get(key) ?? { likes: 0, comments: 0, shares: 0 };
        cur.likes += s.likes;
        cur.comments += s.comments;
        cur.shares += s.shares;
        buckets.set(key, cur);
      }
      const series = Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v }));

      // Top posts
      const briefMap = new Map(
        (briefs.data ?? []).map((b: { id: string; topic: string }) => [b.id, b.topic])
      );
      const postIdToBrief = new Map(
        (posts as Array<{ id: string; content_brief_id: string | null; fb_permalink_url: string | null }>).map(
          (p) => [p.id, { brief: briefMap.get(p.content_brief_id ?? "") ?? "Untitled", url: p.fb_permalink_url }]
        )
      );
      const scoreByPost = new Map<string, number>();
      for (const s of snapData) {
        scoreByPost.set(
          s.post_id,
          (scoreByPost.get(s.post_id) ?? 0) + s.likes + s.comments * 2 + s.shares * 3
        );
      }
      const topPosts = Array.from(scoreByPost.entries())
        .sort((a, z) => z[1] - a[1])
        .slice(0, 5)
        .map(([pid, score]) => {
          const meta = postIdToBrief.get(pid);
          return { topic: meta?.brief ?? "Unknown", url: meta?.url ?? null, score };
        });

      // AI spend
      const costMap = new Map<string, number>();
      let totalCost = 0;
      for (const u of usage as AiUsage[]) {
        costMap.set(u.provider, (costMap.get(u.provider) ?? 0) + Number(u.estimated_cost_usd ?? 0));
        totalCost += Number(u.estimated_cost_usd ?? 0);
      }
      const costByProvider = Array.from(costMap.entries()).map(([name, value]) => ({ name, value }));

      return { series, topPosts, costByProvider, totalCost };
    },
    enabled: isClientReady(),
    staleTime: 60_000,
  });
}

// ─── Page ID ─────────────────────────────────────────────
export function useActivePageId() {
  return useQuery({
    queryKey: ["activePageId"],
    queryFn: async () => {
      const sb = await createUserClient();
      if (!sb) return null;
      const repo = new PageRepository(sb);
      return repo.getActivePageId();
    },
    enabled: isClientReady(),
    staleTime: 300_000,
  });
}

// ─── Draft Count (for sidebar badge) ─────────────────────
export function useDraftCount() {
  return useQuery({
    queryKey: ["draftCount"],
    queryFn: async () => {
      const repos = await getRepos();
      return repos.briefs.countDrafts();
    },
    enabled: isClientReady(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
