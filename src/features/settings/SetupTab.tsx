import { useState } from "react";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { loadBrand, loadProviders, loadSecrets, getSessionPassphrase, loadInstallStatus } from "@/lib/config-store";
import { runSetup, type SetupStep } from "@/lib/setup-runner";
import {
  PlayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

export function SetupTab() {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = loadInstallStatus();

  async function start() {
    setError(null);
    setDone(false);
    setSteps([]);
    const pass = getSessionPassphrase();
    if (!pass) {
      setError("Unlock your credentials first (Secrets tab).");
      return;
    }
    const secrets = await loadSecrets(pass);
    if (!secrets) {
      setError("Couldn't decrypt credentials.");
      return;
    }
    const providers = loadProviders();
    setRunning(true);
    const result = await runSetup(secrets, providers, loadBrand(), (step) => {
      setSteps((prev) => {
        const idx = prev.findIndex((p) => p.key === step.key);
        if (idx === -1) return [...prev, step];
        const next = prev.slice();
        next[idx] = step;
        return next;
      });
    });
    setRunning(false);
    if (result.ok) setDone(true);
    else setError(result.error ?? "Setup failed.");
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel
        title="Run Setup"
        description="Provisions your Supabase project: extensions, schema, RLS, RPCs, storage bucket, project secrets. Idempotent — safe to re-run."
        action={
          <GlassButton variant="primary" loading={running} onClick={start}>
            {steps.length === 0 ? <PlayIcon className="h-4 w-4" /> : <ArrowPathIcon className="h-4 w-4" />}
            {steps.length === 0 ? "Run Setup" : "Re-run"}
          </GlassButton>
        }
      >
        <div className="mb-4 flex flex-wrap gap-2 text-[11px]">
          <Badge ok={status.schemaVersion > 0}>schema v{status.schemaVersion}</Badge>
          <Badge ok={status.storageBucketReady}>storage bucket</Badge>
          <Badge ok={status.vaultReady}>project secrets</Badge>
          <Badge ok={status.edgeFunctionsReady}>edge cron</Badge>
        </div>

        {steps.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">
            Press Run Setup. The web app will call <code className="text-foreground/80">api.supabase.com</code> directly from your browser — no third party in the loop.
          </p>
        )}

        {steps.length > 0 && (
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.key} className="glass rounded-xl p-3 flex items-start gap-3">
                <StatusDot status={s.status} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.label}</div>
                  {s.detail && (
                    <div className={`mt-0.5 text-xs ${s.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                      {s.detail}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}

        {done && (
          <div className="mt-4 flex items-center gap-2 text-sm text-success">
            <CheckCircleIcon className="h-5 w-5" /> Setup complete. You can now use Dashboard, Schedule, and Analytics.
          </div>
        )}
        {error && (
          <div className="mt-4 flex items-start gap-2 text-sm text-destructive">
            <ExclamationTriangleIcon className="h-5 w-5 mt-0.5" /> {error}
          </div>
        )}
      </GlassPanel>

      <GlassPanel
        title="Automation runtime"
        description="Setup deploys the planner/worker/publisher Edge Function and schedules it with pg_cron. Browser service worker support keeps open tabs fresh while Supabase runs the real background jobs."
      >
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
          <li><span className="text-foreground">planner</span> — generates a 7-day brief plan every 6h</li>
          <li><span className="text-foreground">worker</span> — claims jobs with race-free SQL every minute</li>
          <li><span className="text-foreground">publisher</span> — publishes approved/scheduled posts and tracks engagement</li>
        </ul>
      </GlassPanel>
    </div>
  );
}

function StatusDot({ status }: { status: SetupStep["status"] }) {
  if (status === "running")
    return <span className="mt-1.5 h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary)]" />;
  if (status === "done")
    return <CheckCircleIcon className="h-4 w-4 text-success mt-0.5 shrink-0" />;
  if (status === "error")
    return <ExclamationTriangleIcon className="h-4 w-4 text-destructive mt-0.5 shrink-0" />;
  return <span className="mt-1.5 h-2 w-2 rounded-full bg-muted-foreground/40" />;
}

function Badge({ ok, warning, children }: { ok: boolean; warning?: boolean; children: React.ReactNode }) {
  const cls = ok
    ? "bg-success/10 border-success/30 text-success"
    : warning
    ? "bg-warning/10 border-warning/30 text-warning"
    : "bg-white/5 border-white/10 text-muted-foreground";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 ${cls}`}>{children}</span>;
}
