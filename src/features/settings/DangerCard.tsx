import { useRef, useState } from "react";
import {
  wipeAll,
  exportBackup,
  importBackup,
  savePassphraseHint,
  loadPassphraseHint,
  type BackupDump,
} from "@/lib/config-store";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { invalidateClient } from "@/services/supabase-factory";
import {
  ArrowDownTrayIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

export function DangerCard() {
  const [confirm, setConfirm] = useState(false);
  const [hint, setHint] = useState(loadPassphraseHint);
  const [hintDirty, setHintDirty] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    wipeAll();
    invalidateClient();
    window.location.reload();
  }

  function exportJSON() {
    const dump = exportBackup();
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aurora-backup-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportClick() {
    fileRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const dump = JSON.parse(ev.target?.result as string) as BackupDump;
        if (!dump.exportedAt) {
          setImportMsg("Invalid backup file.");
          return;
        }
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

  return (
    <GlassCard className="p-5">
      <h2 className="text-base font-semibold mb-1">Local data</h2>
      <p className="text-xs text-muted-foreground mb-3">
        Everything is stored in this browser. Your Supabase project is not touched by reset. Backups
        include your encrypted secrets — safe to store, since they still require your passphrase to
        unlock.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <GlassInput
          value={hint}
          onChange={(e) => {
            setHint(e.target.value);
            setHintDirty(true);
          }}
          placeholder="Passphrase hint, e.g. my pet's birthday"
          className="flex-1"
        />
        <GlassButton size="sm" variant="subtle" onClick={saveHint} disabled={!hintDirty}>
          <KeyIcon className="h-3.5 w-3.5" /> Save hint
        </GlassButton>
      </div>

      <div className="flex flex-wrap gap-2">
        <GlassButton size="sm" variant="subtle" onClick={exportJSON}>
          <ArrowDownTrayIcon className="h-3.5 w-3.5" /> Export backup
        </GlassButton>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <GlassButton size="sm" variant="subtle" onClick={handleImportClick}>
          <ArrowUpTrayIcon className="h-3.5 w-3.5" /> Restore from file
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
      {importMsg && <p className="text-sm text-accent mt-2">{importMsg}</p>}
    </GlassCard>
  );
}
