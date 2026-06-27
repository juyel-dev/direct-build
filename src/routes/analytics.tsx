import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { loadInstallStatus, getSessionPassphrase } from "@/lib/config-store";
import { useAnalyticsData } from "@/hooks/useAuroraQuery";
import { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Aurora" }, { name: "description", content: "Engagement, top posts, and cost analytics for your Facebook AI autopilot." }] }),
  component: Analytics,
});

const COLORS = ["oklch(0.78 0.16 195)", "oklch(0.70 0.18 320)", "oklch(0.78 0.16 155)", "oklch(0.82 0.17 80)"];
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
        <div className="grid gap-6 lg:grid-cols-3">
          <GlassPanel title="Engagement over time" className="lg:col-span-2">
            <div className="h-72">
              {series.length === 0 ? (
                <Empty>No engagement data yet. Snapshots appear once your posts are published and the engagement-sync job runs.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="likes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.78 0.16 195)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="oklch(0.78 0.16 195)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="comments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="oklch(0.70 0.18 320)" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="oklch(0.70 0.18 320)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeOpacity={0.06} />
                    <XAxis dataKey="date" stroke="oklch(0.72 0.02 260)" fontSize={11} />
                    <YAxis stroke="oklch(0.72 0.02 260)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "oklch(0.20 0.03 270)", border: "1px solid oklch(1 0 0 / 0.1)", borderRadius: 12 }} />
                    <Area type="monotone" dataKey="likes" stroke="oklch(0.78 0.16 195)" fill="url(#likes)" />
                    <Area type="monotone" dataKey="comments" stroke="oklch(0.70 0.18 320)" fill="url(#comments)" />
                    <Area type="monotone" dataKey="shares" stroke="oklch(0.78 0.16 155)" fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassPanel>

          <GlassPanel title="AI spend" description={`Total: $${totalCost.toFixed(3)}`}>
            <div className="h-72">
              {costByProvider.length === 0 ? (
                <Empty>No AI usage recorded yet.</Empty>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={costByProvider} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {costByProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassPanel>

          <GlassPanel title="Top posts" className="lg:col-span-3">
            {topPosts.length === 0 ? (
              <Empty>No published posts yet.</Empty>
            ) : (
              <ol className="space-y-2">
                {topPosts.map((p, i) => (
                  <li key={i} className="glass rounded-xl p-3 flex items-center gap-3">
                    <span className="font-display text-2xl text-muted-foreground w-8 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.topic}</p>
                      <p className="text-xs text-muted-foreground">Engagement score: {p.score}</p>
                    </div>
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline" aria-label={`View post: ${p.topic}`}>View →</a>}
                  </li>
                ))}
              </ol>
            )}
          </GlassPanel>
        </div>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-full grid place-items-center text-sm text-muted-foreground">{children}</div>;
}
