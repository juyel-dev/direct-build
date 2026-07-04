import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { loadInstallStatus, getSessionPassphrase } from "@/lib/config-store";
import { useAnalyticsData } from "@/hooks/useAuroraQuery";
import type { GrowthTrend } from "@/services/analytics/analytics.service";
import { useState } from "react";
import { AnalyticsCharts } from "@/components/charts/LazyCharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Aurora" }, { name: "description", content: "Engagement, top posts, and cost analytics for your Facebook AI autopilot." }] }),
  component: Analytics,
});

const RANGES = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

function Analytics() {
  const inst = loadInstallStatus();
  const unlocked = !!getSessionPassphrase();
  const [range, setRange] = useState(30);
  const { data, isLoading } = useAnalyticsData(range);
  const series = data?.series ?? [];
  const topPosts = data?.topPosts ?? [];
  const costByProvider = data?.costByProvider ?? [];
  const totalCost = data?.totalCost ?? 0;
  const wow = data?.wow ?? { likes: 0, comments: 0, shares: 0, cost: 0 };
  const growth = data?.growth ?? { direction: "flat" as GrowthTrend["direction"], pct: 0 };

  if (inst.schemaVersion === 0 || !unlocked) {
    return (
      <AppShell>
        <GlassPanel title="Analytics unavailable" description="Run setup and unlock your credentials first.">
          <Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>
        </GlassPanel>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Insights</p>
          <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium gradient-text">Analytics</h1>
        </div>
        <div className="glass rounded-xl p-0.5 flex">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setRange(r.days)}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition ${
                range === r.days ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={`Show last ${r.label}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <AnalyticsSkeleton />
      ) : (
        <AnalyticsCharts
          series={series}
          costByProvider={costByProvider}
          topPosts={topPosts}
          totalCost={totalCost}
          wow={wow}
          growth={growth}
        />
      )}
    </AppShell>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 glass rounded-2xl p-6">
        <div className="h-4 w-40 rounded shimmer-bg mb-4" />
        <div className="h-64 rounded-xl shimmer-bg" />
      </div>
      <div className="glass rounded-2xl p-6">
        <div className="h-4 w-24 rounded shimmer-bg mb-4" />
        <div className="h-64 rounded-xl shimmer-bg" />
      </div>
      <div className="lg:col-span-3 glass rounded-2xl p-6">
        <div className="h-4 w-28 rounded shimmer-bg mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="glass rounded-xl p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg shimmer-bg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-48 rounded shimmer-bg" />
                <div className="h-3 w-24 rounded shimmer-bg" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
