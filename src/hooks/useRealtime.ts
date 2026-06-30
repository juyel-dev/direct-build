import { useEffect, useRef } from "react";
import { createUserClient } from "../services/supabase-factory";
import { useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Subscribes to Supabase Realtime changes on key tables and
 * invalidates React Query caches when data changes.
 */
export function useRealtime(pageId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);

  useEffect(() => {
    if (!pageId) return;

    let cancelled = false;

    (async () => {
      const supabase = await createUserClient();
      if (!supabase || cancelled) return;

      const channel = supabase
        .channel("aurora-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "system_events", filter: `page_id=eq.${pageId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["worker-status"] });
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "content_briefs", filter: `page_id=eq.${pageId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["drafts"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "posts", filter: `page_id=eq.${pageId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
          },
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "engagement_snapshots" },
          () => {
            queryClient.invalidateQueries({ queryKey: ["analytics"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          },
        )
        .subscribe();

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) {
        channelRef.current.unsubscribe();
        channelRef.current = null;
      }
    };
  }, [pageId, queryClient]);
}
