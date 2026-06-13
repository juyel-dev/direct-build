import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { wipeAll, loadSecrets, getSessionPassphrase } from "@/lib/config-store";
import { invalidateUserSupabase } from "@/lib/user-supabase";
import { ArrowDownTrayIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";

export function DangerTab() {
  const [confirm, setConfirm] = useState(false);

  async function exportEverything() {
    const pass = getSessionPassphrase();
    const secrets = pass ? await loadSecrets(pass) : null;
    const dump = {
      exportedAt: new Date().toISOString(),
      secrets: secrets ? { ...secrets, supabaseServiceKey: "***", supabasePAT: "***", facebookPageToken: "***", aiApiKey: "***", imageApiKey: "***" } : null,
      providers: localStorage.getItem("fbai.providers.v1"),
      brand: localStorage.getItem("fbai.brand.v1"),
      install: localStorage.getItem("fbai.install.v1"),
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reset() {
    wipeAll();
    invalidateUserSupabase();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel title="Export local state" description="Sensitive values are redacted in the export.">
        <GlassButton variant="subtle" onClick={exportEverything}>
          <ArrowDownTrayIcon className="h-4 w-4" /> Download JSON
        </GlassButton>
      </GlassPanel>

      <GlassPanel
        title="Reset this install"
        description="Wipes all locally stored credentials and config. Your Supabase project is NOT touched."
      >
        {!confirm ? (
          <GlassButton variant="destructive" onClick={() => setConfirm(true)}>
            <TrashIcon className="h-4 w-4" /> Reset
          </GlassButton>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-warning">Are you sure?</span>
            <GlassButton variant="destructive" onClick={reset}>Yes, wipe</GlassButton>
            <GlassButton variant="ghost" onClick={() => setConfirm(false)}>Cancel</GlassButton>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
