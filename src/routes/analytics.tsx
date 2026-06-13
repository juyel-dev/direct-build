import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { useEffect, useState } from "react";
import { getUserSupabase } from "@/lib/user-supabase";
import { getSessionPassphrase, loadInstallStatus } from "@/lib/config-store";
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
import { format, subDays } from "date-fns";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Aurora" }, { name: "description", content: "Engagement, top posts, and cost analytics for your Facebook AI autopilot." }] }),
  component: Analytics,
});

type Snap = { post_id: string; captured_at: string; likes: number; comments: number; shares: number; impressions: number };
type Post = { id: string; published_at: string | null; fb_permalink_url: string | null; content_brief_id: string | null };
type Brief = { id: string; topic: string };
type Usage = { provider: string; model: string; estimated_cost_usd: number; called_at: string };

function Analytics() {
  const [series, setSeries] = useState<{ date: string; likes: number; comments: number; shares: number }[]>([]);
  const [topPosts, setTopPosts] = useState<{ topic: string; url: string | null; score: number }[]>([]);
  const [costByProvider, setCostByProvider] = useState<{ name: string; value: number }[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [ready, setReady] = useState(false);
  const inst = loadInstallStatus();
  const unlocked = !!getSessionPassphrase();

  useEffect(() => {
    (async () => {
      if (!unlocked || inst.schemaVersion === 0) { setReady(true); return; }
      const sb = await getUserSupabase();
      if (!sb) { setReady(true); return; }
      const since = subDays(new Date(), 30).toISOString();
      const [snaps, posts, briefs, usage] = await Promise.all([
        sb.from("engagement_snapshots").select("post_id, captured_at, likes, comments, shares, impressions").gte("captured_at", since),
        sb.from("posts").select("id, published_at, fb_permalink_url, content_brief_id"),
        sb.from("content_briefs").select("id, topic"),
        sb.from("ai_usage").select("provider, model, estimated_cost_usd, called_at").gte("called_at", since),
      ]);
      const snapData = (snaps.data ?? []) as Snap[];
      const buckets = new Map<string, { likes: number; comments: number; shares: number }>();
      for (const s of snapData) {
        const key = format(new Date(s.captured_at), "MMM d");
        const cur = buckets.get(key) ?? { likes: 0, comments: 0, shares: 0 };
        cur.likes += s.likes;
        cur.comments += s.comments;
        cur.shares += s.shares;
        buckets.set(key, cur);
      }
      setSeries(Array.from(buckets.entries()).map(([date, v]) => ({ date, ...v })));

      const briefMap = new Map((briefs.data ?? []).map((b: Brief) => [b.id, b.topic]));
      const postIdToBrief = new Map((posts.data ?? []).map((p: Post) => [p.id, { brief: briefMap.get(p.content_brief_id ?? "") ?? "Untitled", url: p.fb_permalink_url }]));
      const scoreByPost = new Map<string, number>();
      for (const s of snapData) {
        scoreByPost.set(s.post_id, (scoreByPost.get(s.post_id) ?? 0) + s.likes + s.comments * 2 + s.shares * 3);
      }
      const top = Array.from(scoreByPost.entries())
        .sort((a, z) => z[1] - a[1])
        .slice(0, 5)
        .map(([pid, score]) => {
          const meta = postIdToBrief.get(pid);
          return { topic: meta?.brief ?? "Unknown", url: meta?.url ?? null, score };
        });
      setTopPosts(top);

      const costMap = new Map<string, number>();
      let total = 0;
      for (const u of (usage.data ?? []) as Usage[]) {
        costMap.set(u.provider, (costMap.get(u.provider) ?? 0) + Number(u.estimated_cost_usd ?? 0));
        total += Number(u.estimated_cost_usd ?? 0);
      }
      setTotalCost(total);
      setCostByProvider(Array.from(costMap.entries()).map(([name, value]) => ({ name, value })));

      setReady(true);
    })();
  }, [unlocked, inst.schemaVersion]);

  if (inst.schemaVersion === 0 || !unlocked) {
    return (
      <AppShell>
        <GlassPanel title="Analytics unavailable" description="Run setup and unlock your credentials first.">
          <Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>
        </GlassPanel>
      </AppShell>
    );
  }

  const COLORS = ["oklch(0.78 0.16 195)", "oklch(0.70 0.18 320)", "oklch(0.78 0.16 155)", "oklch(0.82 0.17 80)"];

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Last 30 days</p>
        <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium gradient-text">Analytics</h1>
      </div>

      {!ready ? (
        <div className="glass rounded-2xl h-80 shimmer-bg" />
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
                    {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">View →</a>}
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-full grid place-items-center text-sm text-muted-foreground">{children}</div>;
}
