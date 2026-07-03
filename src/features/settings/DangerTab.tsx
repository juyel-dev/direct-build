import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import {
  wipeAll, exportBackup, importBackup,
  savePassphraseHint, loadPassphraseHint,
} from "@/lib/config-store";
import { invalidateUserSupabase } from "@/lib/user-supabase";
import { ArrowDownTrayIcon, ArrowUpTrayIcon, TrashIcon, KeyIcon } from "@heroicons/react/24/outline";
import { useState, useRef, useCallback } from "react";
import type { BackupDump } from "@/lib/config-store";

export function DangerTab() {
  const [confirm, setConfirm] = useState(false);
  const [hint, setHint] = useState(loadPassphraseHint);
  const [hintDirty, setHintDirty] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportBackupWithSecrets() {
    const dump = exportBackup();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const handleImport = useCallback(() => {
    fileRef.current?.click();
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const dump = JSON.parse(ev.target?.result as string) as BackupDump;
        if (!dump.exportedAt) { setImportMsg("Invalid backup file."); return; }
        const restored = importBackup(dump);
        setImportMsg(`Restored: ${restored.join(", ")}.`);
      } catch {
        setImportMsg("Failed to parse backup file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function saveHint() {
    savePassphraseHint(hint);
    setHintDirty(false);
  }

  function reset() {
    wipeAll();
    invalidateUserSupabase();
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel title="Passphrase hint" description="Optional reminder shown when unlocking your vault.">
        <div className="flex gap-3">
          <GlassInput value={hint} onChange={(e) => { setHint(e.target.value); setHintDirty(true); }}
            placeholder="e.g. my pet's birthday" className="flex-1" />
          <GlassButton variant="subtle" onClick={saveHint} disabled={!hintDirty}>
            <KeyIcon className="h-4 w-4" /> Save
          </GlassButton>
        </div>
      </GlassPanel>

      <GlassPanel title="Export backup" description="Includes encrypted secrets (safe to store). Use the import below to restore.">
        <GlassButton variant="subtle" onClick={exportBackupWithSecrets}>
          <ArrowDownTrayIcon className="h-4 w-4" /> Download backup
        </GlassButton>
      </GlassPanel>

      <GlassPanel title="Import backup" description="Restore from a previously exported JSON file.">
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
        <GlassButton variant="subtle" onClick={handleImport}>
          <ArrowUpTrayIcon className="h-4 w-4" /> Restore from file
        </GlassButton>
        {importMsg && <p className="text-sm text-accent mt-2">{importMsg}</p>}
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
