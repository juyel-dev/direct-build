import { useState } from "react";
import { wipeAll } from "@/lib/config-store";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { invalidateClient } from "@/services/supabase-factory";
import { TrashIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";

export function DangerCard() {
  const [confirm, setConfirm] = useState(false);

  function reset() {
    wipeAll();
    invalidateClient();
    window.location.reload();
  }
  function exportJSON() {
    const dump = {
      exportedAt: new Date().toISOString(),
      providers: localStorage.getItem("fbai.providers.v1"),
      brand: localStorage.getItem("fbai.brand.v1"),
      install: localStorage.getItem("fbai.install.v1"),
      note: "Secrets are encrypted and intentionally not exported.",
    };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <GlassCard className="p-5">
      <h2 className="text-base font-semibold mb-1">Local data</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Everything is stored in this browser. Your Supabase project is not touched by reset.
      </p>
      <div className="flex flex-wrap gap-2">
        <GlassButton size="sm" variant="subtle" onClick={exportJSON}>
          <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export
        </GlassButton>
        {!confirm ? (
          <GlassButton
            size="sm"
            variant="ghost"
            onClick={() => setConfirm(true)}
            className="text-destructive"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Reset
          </GlassButton>
        ) : (
          <>
            <GlassButton size="sm" variant="destructive" onClick={reset}>
              Yes, wipe
            </GlassButton>
            <GlassButton size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </GlassButton>
          </>
        )}
      </div>
    </GlassCard>
  );
}
