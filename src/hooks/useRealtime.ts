import { useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { getSessionPassphrase, loadSecrets, hasStoredSecrets } from "@/lib/config-store";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribes to Supabase Realtime changes on key tables and
 * invalidates React Query caches when data changes.
 */
export function useRealtime(pageId: string | null) {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof createClient.prototype.channel> | null>(null);

  useEffect(() => {
    if (!pageId || !hasStoredSecrets()) return;

    const pass = getSessionPassphrase();
    if (!pass) return;

    let cancelled = false;

    (async () => {
      const secrets = await loadSecrets(pass);
      if (!secrets || cancelled) return;

      const supabase = createClient(secrets.supabaseUrl, secrets.supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

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
