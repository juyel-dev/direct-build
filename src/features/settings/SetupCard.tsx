import { useState } from "react";
import {
  type Secrets,
  type Providers,
  type Brand,
} from "@/lib/config-store";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { runSetup, type SetupStep } from "@/lib/setup-runner";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlayIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

export function SetupCard({
  secrets,
  providers,
  brand,
  onStatus,
}: {
  secrets: Secrets;
  providers: Providers;
  brand: Brand;
  onStatus: () => void;
}) {
  const [steps, setSteps] = useState<SetupStep[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    setErr(null);
    setDone(false);
    setSteps([]);
    if (!secrets.supabaseUrl || !secrets.supabasePAT) {
      setErr("Add your Supabase URL and PAT first.");
      return;
    }
    setRunning(true);
    const result = await runSetup(secrets, providers, brand, (step) => {
      setSteps((prev) => {
        const idx = prev.findIndex((p) => p.key === step.key);
        if (idx === -1) return [...prev, step];
        const next = prev.slice();
        next[idx] = step;
        return next;
      });
    });
    setRunning(false);
    onStatus();
    if (result.ok) setDone(true);
    else setErr(result.error ?? "Setup failed.");
  }

  return (
    <GlassCard className="p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <PlayIcon className="h-4 w-4 text-primary" /> Run setup
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Provisions schema, RLS, RPCs, storage bucket and project secrets. Idempotent.
          </p>
        </div>
        <GlassButton variant="primary" loading={running} onClick={start} className="shrink-0">
          {steps.length === 0 ? (
            <PlayIcon className="h-4 w-4" />
          ) : (
            <ArrowPathIcon className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{steps.length === 0 ? "Run setup" : "Re-run"}</span>
        </GlassButton>
      </div>

      {steps.length > 0 && (
        <ol className="space-y-1.5 mt-2">
          {steps.map((s) => (
            <li
              key={s.key}
              className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-2.5 items-start"
            >
              <span className="mt-1">
                {s.status === "running" && (
                  <span className="block h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
                {s.status === "done" && <CheckCircleIcon className="h-4 w-4 text-success" />}
                {s.status === "error" && (
                  <ExclamationTriangleIcon className="h-4 w-4 text-destructive" />
                )}
                {s.status === "pending" && (
                  <span className="block h-2 w-2 rounded-full bg-muted-foreground/40" />
                )}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium">{s.label}</div>
                {s.detail && (
                  <div
                    className={cn(
                      "mt-0.5 text-[11px] break-words",
                      s.status === "error" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {s.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {done && (
        <div className="mt-3 text-sm text-success flex items-center gap-2">
          <CheckCircleIcon className="h-4 w-4" /> Setup complete.
        </div>
      )}
      {err && (
        <div className="mt-3 text-sm text-destructive flex items-start gap-2">
          <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" /> {err}
        </div>
      )}
    </GlassCard>
  );
}
