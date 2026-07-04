import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { useMemo, useState, useEffect } from "react";
import { loadBrand, loadInstallStatus, getSessionPassphrase, hasStoredSecrets, loadProviders, loadSecrets } from "@/lib/config-store";
import { useRealtime } from "@/hooks/useRealtime";
import { useActivePageId, useDashboardData } from "@/hooks/useAuroraQuery";
import {
  Hero, Stat, RowMetric, healthColor, HealthPill, StatusPill,
  EmptyBriefs, LoadingSkeleton, formatTimeAgo,
} from "./index/components";
import { createUserClient } from "@/services/supabase-factory";
import { StrategyService } from "@/services/strategy.service";
import { BrandMemoryService } from "@/services/brand-memory.service";
import { buildLlmConfig } from "@/services/ai/providers/llm-providers";
import type { StrategyRecommendation, BrandMemory } from "@/types";
import {
  SparklesIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
  CalendarDaysIcon,
  ClockIcon,
  FireIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  CpuChipIcon,
  LightBulbIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
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
  const alerts = data?.alerts ?? [];

  useEffect(() => {
    if (alerts.length === 0) return;
    const notified = new Set<string>(
      JSON.parse(sessionStorage.getItem("aurora-notified-alerts") ?? "[]"),
    );
    for (const a of alerts) {
      if (notified.has(a.id)) continue;
      notified.add(a.id);
      if (a.category === "facebook_token_expired") {
        toast.error("Facebook token expired", {
          description: a.message,
          duration: 10_000,
        });
      } else if (a.category === "dead_letter") {
        toast.error("Job failed permanently", {
          description: a.message,
          duration: 8_000,
        });
      }
    }
    sessionStorage.setItem("aurora-notified-alerts", JSON.stringify([...notified]));
  }, [alerts]);

  const [recommendations, setRecommendations] = useState<StrategyRecommendation[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [dismissedTypes, setDismissedTypes] = useState<Set<string>>(new Set());
  const [brandMemory, setBrandMemory] = useState<BrandMemory | null>(null);

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

  useEffect(() => {
    if (!pageId) return;
    (async () => {
      const sb = await createUserClient();
      if (!sb) return;
      const svc = new BrandMemoryService(sb);
      const memory = await svc.load(pageId);
      setBrandMemory(memory);
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

      {alerts.length > 0 && (
        <GlassCard className="p-4 mb-6 border-destructive/30">
          <div className="flex items-center gap-3 mb-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-destructive shrink-0" />
            <h2 className="text-sm font-semibold">System Alerts ({alerts.length})</h2>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs">
                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-destructive">
                  {a.category}
                </span>
                <span className="text-muted-foreground">{a.message}</span>
                <span className="shrink-0 ml-auto text-muted-foreground/50">{formatTimeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      <GlassCard className="p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg" style={{
              backgroundColor: healthColor(stats?.health ?? "healthy", "bg"),
            }}>
              <CpuChipIcon className="h-5 w-5" style={{ color: healthColor(stats?.health ?? "healthy", "text") }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Worker Health</p>
                <HealthPill status={stats?.health ?? "healthy"} />
              </div>
              <p className="text-xs text-muted-foreground">
                {stats?.workerLastRun
                  ? `Last run: ${formatTimeAgo(stats.workerLastRun)}`
                  : "No runs yet"}
              </p>
            </div>
          </div>
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
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>Today: <strong className="text-foreground">{stats?.workerTodayRuns ?? 0}</strong> runs</span>
          <span>Errors (24h): <strong className={stats && stats.workerErrors24h > 0 ? "text-destructive" : "text-foreground"}>{stats?.workerErrors24h ?? 0}</strong></span>
          <span>Queue: <strong className="text-foreground">{stats?.queueDepth ?? 0}</strong> jobs</span>
          <span>Circuit: <strong className={stats?.circuitOpen ? "text-destructive" : "text-success"}>
            {stats?.circuitOpen ? "Open" : "Closed"}
          </strong></span>
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
              deterministic_timing: "border-l-warning",
              deterministic_content: "border-l-primary",
              deterministic_hashtag: "border-l-[oklch(0.55_0.15_160)]",
            };
            const typeLabels: Record<string, string> = {
              deterministic_timing: "data-driven timing",
              deterministic_content: "data-driven content",
              deterministic_hashtag: "data-driven hashtag",
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
                        {typeLabels[rec.recommendation_type] ?? rec.recommendation_type}
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

      {brandMemory && (brandMemory.brand_personality || (brandMemory.content_pillars?.length ?? 0) > 0) && (
        <GlassCard className="p-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <SparklesIcon className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold">Brand Strategy</h2>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {brandMemory.llm_analyzed_at
                ? `LLM analyzed ${format(new Date(brandMemory.llm_analyzed_at), "MMM d, HH:mm")}`
                : "Auto-extracted only"}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {brandMemory.brand_personality && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Personality</p>
                <p className="text-sm">{brandMemory.brand_personality}</p>
              </div>
            )}
            {brandMemory.storytelling_style && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Storytelling</p>
                <p className="text-sm">{brandMemory.storytelling_style}</p>
              </div>
            )}
            {(brandMemory.content_pillars?.length ?? 0) > 0 && (
              <div className="sm:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Content Pillars</p>
                <div className="flex flex-wrap gap-1.5">
                  {brandMemory.content_pillars!.map((p, i) => (
                    <span key={i} className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent border border-accent/20">{p}</span>
                  ))}
                </div>
              </div>
            )}
            {brandMemory.strengths_weaknesses && typeof brandMemory.strengths_weaknesses === "object" && !Array.isArray(brandMemory.strengths_weaknesses) && (
              <div className="sm:col-span-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Strengths &amp; Weaknesses</p>
                <div className="grid gap-2 sm:grid-cols-2 mt-1">
                  <div className="rounded-lg bg-success/5 border border-success/15 p-2.5">
                    <p className="text-[10px] font-medium text-success mb-0.5">Strengths</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {(brandMemory.strengths_weaknesses as Record<string, string[]>).strengths?.map((s: string, i: number) => (
                        <li key={i}>+ {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-destructive/5 border border-destructive/15 p-2.5">
                    <p className="text-[10px] font-medium text-destructive mb-0.5">Weaknesses</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {(brandMemory.strengths_weaknesses as Record<string, string[]>).weaknesses?.map((w: string, i: number) => (
                        <li key={i}>- {w}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      )}

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


