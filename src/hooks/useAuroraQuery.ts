import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getUserSupabase } from "@/lib/user-supabase";
import {
  getSessionPassphrase,
  hasStoredSecrets,
  loadInstallStatus,
  loadBrand,
  loadProviders,
} from "@/lib/config-store";
import { addDays, subDays, format } from "date-fns";

function isReady() {
  return !!getSessionPassphrase() && hasStoredSecrets() && loadInstallStatus().schemaVersion > 0;
}

// ─── Dashboard ───────────────────────────────────────────
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

type SystemEvent = {
  id: string;
  severity: string;
  category: string;
  message: string;
  created_at: string;
};

export function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const sb = await getUserSupabase();
      if (!sb) throw new Error("Could not initialize Supabase client.");

      const [briefRes, postRes, snapRes, eventsRes] = await Promise.all([
        sb
          .from("content_briefs")
          .select("id, slot_start, topic, caption, status, image_url")
          .order("slot_start")
          .limit(5),
        sb
          .from("posts")
          .select("id, published_at")
          .gte("published_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
        sb
          .from("engagement_snapshots")
          .select("likes, comments, shares")
          .order("captured_at", { ascending: false })
          .limit(100),
        sb
          .from("system_events")
          .select("id, severity, category, message, created_at")
          .eq("category", "worker")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (briefRes.error) throw briefRes.error;

      const briefs = (briefRes.data ?? []) as DashboardBrief[];
      const snaps = (snapRes.data ?? []) as { likes: number; comments: number; shares: number }[];
      const events = (eventsRes.data ?? []) as SystemEvent[];

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const todayRuns = events.filter((e) => new Date(e.created_at) >= todayStart).length;

      const stats: DashboardStats = {
        posts7d: (postRes.data ?? []).length,
        briefsPending: briefs.filter((b) => b.status === "draft").length,
        totalLikes: snaps.reduce((a, s) => a + (s.likes ?? 0), 0),
        totalComments: snaps.reduce((a, s) => a + (s.comments ?? 0), 0),
        totalShares: snaps.reduce((a, s) => a + (s.shares ?? 0), 0),
        workerLastRun: events[0]?.created_at ?? null,
        workerTodayRuns: todayRuns,
      };

      return { briefs, stats };
    },
    enabled: isReady(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Drafts ──────────────────────────────────────────────
export type Draft = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  image_url: string | null;
  status: string;
  created_at: string;
};

export function useDrafts() {
  return useQuery({
    queryKey: ["drafts"],
    queryFn: async () => {
      const sb = await getUserSupabase();
      if (!sb) return [];

      const [briefRes, pageRes] = await Promise.all([
        sb
          .from("content_briefs")
          .select(
            "id, page_id, slot_start, topic, caption, hashtags, image_prompt, image_url, status, created_at"
          )
          .eq("status", "draft")
          .order("slot_start", { ascending: true }),
        sb.from("pages").select("fb_page_name").limit(1).maybeSingle(),
      ]);

      if (briefRes.error) throw briefRes.error;
      const pageName = (pageRes.data as { fb_page_name: string } | null)?.fb_page_name ?? "";
      return { drafts: (briefRes.data ?? []) as Draft[], pageName };
    },
    enabled: isReady(),
    staleTime: 30_000,
  });
}

export function useApproveDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (draftId: string) => {
      const sb = await getUserSupabase();
      if (!sb) throw new Error("No Supabase client");
      const { error } = await sb
        .from("content_briefs")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);
      if (error) throw error;
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
      const sb = await getUserSupabase();
      if (!sb) throw new Error("No Supabase client");
      const { error } = await sb
        .from("content_briefs")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", draftId);
      if (error) throw error;
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
      const sb = await getUserSupabase();
      if (!sb) throw new Error("No Supabase client");
      const { error } = await sb
        .from("content_briefs")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .in("id", draftIds);
      if (error) throw error;
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
      const sb = await getUserSupabase();
      if (!sb) throw new Error("No Supabase client");
      const { error } = await sb
        .from("content_briefs")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .in("id", draftIds);
      if (error) throw error;
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
      const sb = await getUserSupabase();
      if (!sb) return { pages: [], briefs: [] };

      const { data: pData } = await sb.from("pages").select("id, fb_page_name");
      const pages = (pData ?? []) as Page[];

      if (!pageId && !pages[0]?.id) return { pages, briefs: [] };

      const pid = pageId || pages[0]?.id;
      const { data: bData, error: bErr } = await sb
        .from("content_briefs")
        .select("*")
        .eq("page_id", pid)
        .gte("slot_start", weekDays[0].toISOString())
        .lt("slot_start", addDays(weekDays[6], 1).toISOString())
        .order("slot_start");

      if (bErr) throw bErr;
      return { pages, briefs: (bData ?? []) as ScheduleBrief[] };
    },
    enabled: isReady(),
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
      const sb = await getUserSupabase();
      if (!sb) return { series: [], topPosts: [], costByProvider: [], totalCost: 0 };

      const since = subDays(new Date(), days).toISOString();
      const [snaps, posts, briefs, usage] = await Promise.all([
        sb
          .from("engagement_snapshots")
          .select("post_id, captured_at, likes, comments, shares, impressions")
          .gte("captured_at", since),
        sb.from("posts").select("id, published_at, fb_permalink_url, content_brief_id"),
        sb.from("content_briefs").select("id, topic"),
        sb
          .from("ai_usage")
          .select("provider, model, estimated_cost_usd, called_at")
          .gte("called_at", since),
      ]);

      const snapData = (snaps.data ?? []) as EngagementSnap[];

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
        (posts.data ?? []).map(
          (p: {
            id: string;
            published_at: string | null;
            fb_permalink_url: string | null;
            content_brief_id: string | null;
          }) => [
            p.id,
            {
              brief: briefMap.get(p.content_brief_id ?? "") ?? "Untitled",
              url: p.fb_permalink_url,
            },
          ]
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
      for (const u of (usage.data ?? []) as {
        provider: string;
        model: string;
        estimated_cost_usd: number;
        called_at: string;
      }[]) {
        costMap.set(
          u.provider,
          (costMap.get(u.provider) ?? 0) + Number(u.estimated_cost_usd ?? 0)
        );
        totalCost += Number(u.estimated_cost_usd ?? 0);
      }
      const costByProvider = Array.from(costMap.entries()).map(([name, value]) => ({
        name,
        value,
      }));

      return { series, topPosts, costByProvider, totalCost };
    },
    enabled: isReady(),
    staleTime: 60_000,
  });
}

// ─── Page ID ─────────────────────────────────────────────
export function useActivePageId() {
  return useQuery({
    queryKey: ["activePageId"],
    queryFn: async () => {
      const sb = await getUserSupabase();
      if (!sb) return null;
      const { data } = await sb
        .from("pages")
        .select("id")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return (data?.id as string) ?? null;
    },
    enabled: isReady(),
    staleTime: 300_000,
  });
}

// ─── Draft Count (for sidebar badge) ─────────────────────
export function useDraftCount() {
  return useQuery({
    queryKey: ["draftCount"],
    queryFn: async () => {
      const sb = await getUserSupabase();
      if (!sb) return 0;
      const { count } = await sb
        .from("content_briefs")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft");
      return count ?? 0;
    },
    enabled: isReady(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
