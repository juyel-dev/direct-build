import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { useMemo, useState, useEffect } from "react";
import { loadBrand, loadInstallStatus, getSessionPassphrase, hasStoredSecrets, loadProviders, loadSecrets } from "@/lib/config-store";
import { useRealtime } from "@/hooks/useRealtime";
import { useActivePageId, useDashboardData } from "@/hooks/useAuroraQuery";
import { createUserClient } from "@/services/supabase-factory";
import { StrategyService } from "@/services/strategy.service";
import { buildLlmConfig } from "@/services/ai/providers/llm-providers";
import type { StrategyRecommendation } from "@/types";
import {
  SparklesIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  CpuChipIcon,
  LightBulbIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Aurora" },
      { name: "description", content: "Your Facebook AI autopilot dashboard: next posts, engagement, and system health." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const brand = useMemo(() => loadBrand(), []);
  const install = useMemo(() => loadInstallStatus(), []);
  const unlocked = !!getSessionPassphrase();
  const hasCreds = hasStoredSecrets();

  const pageIdQuery = useActivePageId();
  const pageId = pageIdQuery.data ?? null;
  useRealtime(pageId);

  const { data, isLoading, error } = useDashboardData();
  const briefs = data?.briefs ?? [];
  const stats = data?.stats ?? null;

  const [recommendations, setRecommendations] = useState<StrategyRecommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [dismissedTypes, setDismissedTypes] = useState<Set<string>>(new Set());

  async function handleAnalyze() {
    if (!pageId) return;
    setAnalyzing(true);
    setAnalysisError(null);
    setDismissedTypes(new Set());
    try {
      const sb = await createUserClient();
      if (!sb) { setAnalysisError("Unlock your vault first."); return; }
      const pass = getSessionPassphrase();
      const secrets = pass ? await loadSecrets(pass) : null;
      const apiKey = secrets?.aiApiKey ?? "";
      if (!apiKey) { setAnalysisError("No AI API key configured."); return; }
      const providers = loadProviders();
      const config = buildLlmConfig(
        providers.llm.type,
        providers.llm.model || "meta-llama/llama-3.3-70b-instruct:free",
        providers.llm.baseUrl,
        apiKey,
      );
      const svc = new StrategyService(sb);
      const recs = await svc.analyzePage(pageId, config);
      setRecommendations(recs);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      const sb = await createUserClient();
      if (!sb) return;
      const svc = new StrategyService(sb);
      const recs = await svc.loadRecommendations(pageId);
      setRecommendations(recs);
    })();
  }, [pageId]);

  if (!hasCreds) {
    return (
      <AppShell>
        <Hero
          title="Welcome to Aurora"
          subtitle="An open-source Facebook autopilot. No accounts, no vendor lock-in. You bring your own Supabase project, your own AI keys, your own Facebook page. The app provisions everything for you."
          cta={<Link to="/settings"><GlassButton variant="primary" size="lg">Start setup <ArrowRightIcon className="h-4 w-4" /></GlassButton></Link>}
        />
      </AppShell>
    );
  }

  if (!unlocked) {
    return (
      <AppShell>
        <Hero
          title="Unlock to continue"
          subtitle="Your credentials are encrypted in this browser. Open Settings and enter your passphrase to unlock."
          cta={<Link to="/settings"><GlassButton variant="primary" size="lg">Open Settings</GlassButton></Link>}
        />
      </AppShell>
    );
  }

  if (install.schemaVersion === 0) {
    return (
      <AppShell>
        <Hero
          title="One more step — run Setup"
          subtitle="Aurora needs to provision your Supabase project (schema, RPCs, storage). It's idempotent and takes under a minute."
          cta={<Link to="/settings"><GlassButton variant="primary" size="lg">Run Setup</GlassButton></Link>}
        />
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="mb-8">
          <div className="h-3 w-16 rounded shimmer-bg" />
          <div className="mt-2 h-8 w-64 rounded shimmer-bg" />
        </div>
        <LoadingSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Today</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium">
          <span className="gradient-text">{brand.brandName || "Your brand"}</span>, on autopilot.
        </h1>
      </div>

      {error && (
        <GlassCard className="p-4 mb-6 border-destructive/30">
          <p className="text-sm text-destructive">{error.message}</p>
        </GlassCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat icon={<CalendarDaysIcon className="h-5 w-5" />} label="Published 7d" value={stats?.posts7d ?? 0} />
        <Stat icon={<ClockIcon className="h-5 w-5" />} label="Briefs pending" value={stats?.briefsPending ?? 0} />
        <Stat icon={<HeartIcon className="h-5 w-5" />} label="Likes (recent)" value={stats?.totalLikes ?? 0} accent="aurora" />
        <Stat icon={<ChatBubbleLeftIcon className="h-5 w-5" />} label="Comments" value={stats?.totalComments ?? 0} />
      </div>

      <GlassCard className="p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-success/15">
              <CpuChipIcon className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm font-medium">Worker Status</p>
              <p className="text-xs text-muted-foreground">
                {stats?.workerLastRun
                  ? `Last run: ${formatTimeAgo(stats.workerLastRun)}`
                  : "No runs yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Today: {stats?.workerTodayRuns ?? 0} runs</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              brand.postingMode === "full_auto"
                ? "bg-success/15 text-success border border-success/30"
                : brand.postingMode === "hybrid"
                ? "bg-accent/15 text-accent border border-accent/30"
                : "bg-white/10 text-muted-foreground border border-white/10"
            }`}>
              <FireIcon className="h-3 w-3" />
              {brand.postingMode === "full_auto" ? "Auto" : brand.postingMode === "hybrid" ? "Hybrid" : "Manual"}
            </span>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LightBulbIcon className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold">Strategy Recommendations</h2>
          </div>
          <GlassButton
            size="sm"
            variant="subtle"
            loading={analyzing}
            onClick={handleAnalyze}
          >
            <SparklesIcon className="h-3.5 w-3.5" /> Analyze page
          </GlassButton>
        </div>
        {analysisError && (
          <p className="text-xs text-destructive mb-2">{analysisError}</p>
        )}
        {recommendations.length === 0 && !analyzing && !analysisError && (
          <p className="text-xs text-muted-foreground">
            Click "Analyze page" to get AI-powered content strategy suggestions based on your brand memory and post performance.
          </p>
        )}
        {recommendations
          .filter((r) => !dismissedTypes.has(r.recommendation_type))
          .slice(0, 5)
          .map((rec) => {
            const typeColors: Record<string, string> = {
              topic: "border-l-accent",
              hook: "border-l-primary",
              timing: "border-l-warning",
              brand_voice: "border-l-success",
              content_angle: "border-l-[oklch(0.70_0.20_320)]",
            };
            return (
              <div
                key={rec.id}
                className={`border-l-2 ${typeColors[rec.recommendation_type] ?? "border-l-white/20"} pl-3 py-2 mt-2 group`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {rec.recommendation_type}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">
                        priority {rec.priority}/10
                      </span>
                    </div>
                    <p className="text-sm mt-0.5">{rec.recommendation_text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{rec.reasoning}</p>
                  </div>
                  <button
                    onClick={() => setDismissedTypes(new Set(dismissedTypes).add(rec.recommendation_type))}
                    className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
      </GlassCard>

      <div className="grid gap-6 lg:grid-cols-3">
        <GlassPanel
          title="Next 5 posts"
          description="Click a brief to approve or edit on the Schedule."
          className="lg:col-span-2"
          action={<Link to="/schedule"><GlassButton size="sm" variant="ghost">Open schedule <ArrowRightIcon className="h-3.5 w-3.5" /></GlassButton></Link>}
        >
          {briefs.length === 0 ? (
            <EmptyBriefs />
          ) : (
            <ul className="space-y-2">
              {briefs.map((b) => (
                <li key={b.id} className="glass rounded-xl p-3 flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/5 text-xs text-muted-foreground">
                    {format(new Date(b.slot_start), "MMM d")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{format(new Date(b.slot_start), "HH:mm")}</span>
                      <StatusPill status={b.status} />
                    </div>
                    <p className="mt-0.5 text-sm font-medium truncate">{b.topic || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground line-clamp-1">{b.caption || "No caption yet."}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassPanel>

        <GlassPanel title="Engagement" description="Sum of recent snapshots from your Facebook page.">
          <div className="space-y-3">
            <RowMetric icon={<HeartIcon className="h-4 w-4" />} label="Likes" value={stats?.totalLikes ?? 0} />
            <RowMetric icon={<ChatBubbleLeftIcon className="h-4 w-4" />} label="Comments" value={stats?.totalComments ?? 0} />
            <RowMetric icon={<ShareIcon className="h-4 w-4" />} label="Shares" value={stats?.totalShares ?? 0} />
            <RowMetric icon={<FireIcon className="h-4 w-4" />} label="Posting mode" value={brand.postingMode} />
          </div>
        </GlassPanel>
      </div>
    </AppShell>
  );
}

function Hero({ title, subtitle, cta }: { title: string; subtitle: string; cta: React.ReactNode }) {
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

function Stat({
  icon, label, value, accent,
}: { icon: React.ReactNode; label: string; value: number | string; accent?: "aurora" }) {
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

function RowMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
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

function StatusPill({ status }: { status: string }) {
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

function EmptyBriefs() {
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

function LoadingSkeleton() {
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

function formatTimeAgo(dateStr: string): string {
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
