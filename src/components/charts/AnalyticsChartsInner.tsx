import { GlassPanel } from "../glass/GlassCard";
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

const COLORS = ["oklch(0.78 0.16 195)", "oklch(0.70 0.18 320)", "oklch(0.78 0.16 155)", "oklch(0.82 0.17 80)"];

export default function AnalyticsChartsInner(props: {
  series: { date: string; likes: number; comments: number; shares: number }[];
  costByProvider: { name: string; value: number }[];
  topPosts: { topic: string; url: string | null; score: number }[];
  totalCost: number;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <GlassPanel title="Engagement over time" className="lg:col-span-2">
        <div className="h-72">
          {props.series.length === 0 ? (
            <Empty>No engagement data yet. Snapshots appear once your posts are published and the engagement-sync job runs.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={props.series}>
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

      <GlassPanel title="AI spend" description={`Total: $${props.totalCost.toFixed(3)}`}>
        <div className="h-72">
          {props.costByProvider.length === 0 ? (
            <Empty>No AI usage recorded yet.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={props.costByProvider} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {props.costByProvider.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassPanel>

      <GlassPanel title="Top posts" className="lg:col-span-3">
        {props.topPosts.length === 0 ? (
          <Empty>No published posts yet.</Empty>
        ) : (
          <ol className="space-y-2">
            {props.topPosts.map((p, i) => (
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
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-full grid place-items-center text-sm text-muted-foreground">{children}</div>;
}
