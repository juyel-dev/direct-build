import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createUserClient, isClientReady } from "../services/supabase-factory";
import { DashboardService } from "../services/dashboard-service";
import { AnalyticsService } from "../services/analytics/analytics.service";
import { BriefRepository } from "../repositories/brief-repository";
import { PageRepository } from "../repositories/page-repository";
import { PostRepository } from "../repositories/post-repository";
import { EngagementRepository } from "../repositories/engagement-repository";
import { UsageRepository } from "../repositories/usage-repository";
import { subDays } from "date-fns";
import type { Brief } from "../types";

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
      const svc = new AnalyticsService(sb);
      return svc.getAnalytics(days);
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
