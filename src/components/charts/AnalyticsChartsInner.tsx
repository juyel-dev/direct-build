import { format } from "date-fns";
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

function WoWStat({ label, value }: { label: string; value: number }) {
  const up = value > 0;
  const down = value < 0;
  return (
    <div className="glass rounded-xl px-3 py-2 flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${up ? "text-success" : down ? "text-destructive" : "text-muted-foreground"}`}>
        {value > 0 ? "+" : ""}{value}%
      </span>
      {up && <span className="text-success">▲</span>}
      {down && <span className="text-destructive">▼</span>}
    </div>
  );
}

export default function AnalyticsChartsInner(props: {
  series: { date: string; likes: number; comments: number; shares: number }[];
  costByProvider: { name: string; value: number }[];
  topPosts: { topic: string; url: string | null; score: number; caption: string | null; likes: number; comments: number; shares: number; published_at: string | null }[];
  totalCost: number;
  wow: { likes: number; comments: number; shares: number; cost: number };
  growth: { direction: string; pct: number };
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <GlassPanel title="Engagement over time" className="lg:col-span-2">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Trend</span>
          <span className={`text-xs font-medium ${props.growth.direction === "up" ? "text-success" : props.growth.direction === "down" ? "text-destructive" : "text-muted-foreground"}`}>
            {props.growth.direction === "up" ? "↑" : props.growth.direction === "down" ? "↓" : "→"} {props.growth.pct > 0 ? "+" : ""}{props.growth.pct}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground ml-1">WoW</span>
          <WoWStat label="Likes" value={props.wow.likes} />
          <WoWStat label="Comments" value={props.wow.comments} />
          <WoWStat label="Shares" value={props.wow.shares} />
          <WoWStat label="Cost" value={props.wow.cost} />
        </div>
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
            {props.topPosts.map((p, i) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <li key={i} className="glass rounded-xl p-3 flex items-start gap-3">
                  <span className="font-display text-xl text-muted-foreground w-8 text-center shrink-0">{medal ?? `#${i + 1}`}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.topic}</p>
                    {p.caption && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{p.caption}</p>}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span>Score: {p.score}</span>
                      <span>♥ {p.likes}</span>
                      <span>💬 {p.comments}</span>
                      <span>↗ {p.shares}</span>
                      {p.published_at && <span>{format(new Date(p.published_at), "MMM d")}</span>}
                    </div>
                  </div>
                  {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline shrink-0 mt-1">View →</a>}
                </li>
              );
            })}
          </ol>
        )}
      </GlassPanel>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="h-full grid place-items-center text-sm text-muted-foreground">{children}</div>;
}
