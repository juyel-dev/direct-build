import { Link } from "@tanstack/react-router";
import { GlassCard } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import type { ReactNode } from "react";
import {
  CheckCircleIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";

export function Hero({ title, subtitle, cta }: { title: string; subtitle: string; cta: ReactNode }) {
  return (
    <div className="relative">
      <GlassCard className="relative overflow-hidden p-8 md:p-14">
        <div className="absolute -top-32 -right-24 h-72 w-72 rounded-full bg-[oklch(0.70_0.20_320)] opacity-40 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-[oklch(0.75_0.18_195)] opacity-40 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-muted-foreground">
            <SparklesIcon className="h-3.5 w-3.5 text-primary" /> v1 · open source
          </div>
          <h1 className="font-display text-4xl md:text-6xl leading-[1.05] tracking-tight">
            <span className="gradient-text">{title}</span>
          </h1>
          <p className="mt-5 text-muted-foreground text-lg max-w-xl">{subtitle}</p>
          <div className="mt-7">{cta}</div>
        </div>
      </GlassCard>
    </div>
  );
}

export function Stat({
  icon, label, value, accent,
}: { icon: ReactNode; label: string; value: number | string; accent?: "aurora" }) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
        <span className={accent === "aurora" ? "text-accent" : "text-primary"}>{icon}</span>
      </div>
      <p className="mt-3 font-display text-3xl">{value}</p>
    </GlassCard>
  );
}

export function RowMetric({ icon, label, value }: { icon: ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function healthColor(health: string, variant: "bg" | "text"): string {
  if (health === "critical") return variant === "bg" ? "oklch(0.60_0.22_25 / 0.15)" : "oklch(0.65_0.22_25)";
  if (health === "warning") return variant === "bg" ? "oklch(0.70_0.18_85 / 0.15)" : "oklch(0.75_0.18_85)";
  return variant === "bg" ? "oklch(0.65_0.18_145 / 0.15)" : "oklch(0.70_0.18_145)";
}

export function HealthPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-success/15 text-success border-success/30",
    warning: "bg-warning/10 text-warning border-warning/30",
    critical: "bg-destructive/15 text-destructive border-destructive/30",
  };
  const label: Record<string, string> = {
    healthy: "Healthy",
    warning: "Warning",
    critical: "Critical",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${colors[status] ?? colors.healthy}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "critical" ? "bg-destructive animate-pulse" : status === "warning" ? "bg-warning" : "bg-success"}`} />
      {label[status] ?? "Healthy"}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-white/5 text-muted-foreground border-white/10",
    approved: "bg-primary/15 text-primary border-primary/30",
    scheduled: "bg-accent/15 text-accent border-accent/30",
    published: "bg-success/15 text-success border-success/30",
    skipped: "bg-warning/10 text-warning border-warning/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${map[status] ?? map.draft}`}>{status}</span>;
}

export function EmptyBriefs() {
  return (
    <div className="text-center py-10">
      <CheckCircleIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
      <p className="mt-3 text-sm text-muted-foreground">No briefs scheduled yet.</p>
      <Link to="/schedule" className="inline-block mt-3">
        <GlassButton variant="primary" size="sm">Create your first brief</GlassButton>
      </Link>
    </div>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <GlassCard key={i} className="p-5">
            <div className="h-3 w-20 rounded shimmer-bg" />
            <div className="mt-4 h-7 w-16 rounded shimmer-bg" />
          </GlassCard>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 glass rounded-2xl p-6">
          <div className="h-4 w-32 rounded shimmer-bg mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="glass rounded-xl p-3 flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg shimmer-bg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded shimmer-bg" />
                  <div className="h-3 w-full rounded shimmer-bg" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass rounded-2xl p-6">
          <div className="h-4 w-24 rounded shimmer-bg mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-3 w-full rounded shimmer-bg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
