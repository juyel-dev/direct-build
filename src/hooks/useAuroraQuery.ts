import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createUserClient, isClientReady } from "../services/supabase-factory";
import { DashboardService } from "../services/dashboard-service";
import { SystemEventRepository } from "../repositories/system-event-repository";
import type { AlertCount } from "../repositories/system-event-repository";
import { AnalyticsService } from "../services/analytics/analytics.service";
import { DraftService } from "../services/draft/draft.service";
import { ScheduleService } from "../services/schedule/schedule.service";
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
  health: "healthy" | "warning" | "critical";
  workerErrors24h: number;
  queueDepth: number;
  circuitOpen: boolean;
};

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

// ─── Alerts (lightweight count for nav badge) ────────────
export function useAlertCount() {
  return useQuery({
    queryKey: ["alertCount"],
    queryFn: async () => {
      const sb = await createUserClient();
      if (!sb) return { total: 0, hasTokenExpiry: false, hasDeadLetter: false } satisfies AlertCount;
      const repo = new SystemEventRepository(sb);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return repo.countAlerts(since);
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
      const sb = await createUserClient();
      if (!sb) throw new Error("Could not initialize Supabase client.");
      const svc = new DraftService(sb);
      return svc.findDrafts();
    },
    enabled: isClientReady(),
    staleTime: 30_000,
  });
}

export function useApproveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const sb = await createUserClient();
      if (!sb) throw new Error("Could not initialize Supabase client.");
      const svc = new DraftService(sb);
      await svc.approve(draftId);
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
      const sb = await createUserClient();
      if (!sb) throw new Error("Could not initialize Supabase client.");
      const svc = new DraftService(sb);
      await svc.reject(draftId);
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
      const sb = await createUserClient();
      if (!sb) throw new Error("Could not initialize Supabase client.");
      const svc = new DraftService(sb);
      await svc.bulkApprove(draftIds);
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
      const sb = await createUserClient();
      if (!sb) throw new Error("Could not initialize Supabase client.");
      const svc = new DraftService(sb);
      await svc.bulkReject(draftIds);
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
      const svc = new ScheduleService(sb);
      return svc.findScheduleData(weekDays, pageId);
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
      const svc = new ScheduleService(sb);
      return svc.findActivePageId();
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
      const sb = await createUserClient();
      if (!sb) return 0;
      const svc = new DraftService(sb);
      return svc.countDrafts();
    },
    enabled: isClientReady(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
