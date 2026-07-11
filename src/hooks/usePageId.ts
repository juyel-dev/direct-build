import { useState, useEffect } from "react";
import { createUserClient } from "@/services/supabase-factory";
import { getSessionPassphrase, hasStoredSecrets, loadInstallStatus } from "@/lib/config-store";

/**
 * Fetches the first active page ID from the database.
 * Returns null until loaded, or undefined if no page exists.
 */
export function usePageId(): string | null | undefined {
  const [pageId, setPageId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const pass = getSessionPassphrase();
      if (!pass || !hasStoredSecrets()) {
        if (!cancelled) setPageId(null);
        return;
      }

      const install = loadInstallStatus();
      if (install.schemaVersion === 0) {
        if (!cancelled) setPageId(null);
        return;
      }

      try {
        const sb = await createUserClient();
        if (!sb || cancelled) return;

        const { data } = await sb.from("pages").select("id").eq("status", "active").limit(1).maybeSingle();
        if (!cancelled) setPageId(data?.id ?? null);
      } catch {
        if (!cancelled) setPageId(null);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  return pageId;
}
