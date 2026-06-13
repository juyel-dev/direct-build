import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { useEffect, useMemo, useState } from "react";
import { getUserSupabase } from "@/lib/user-supabase";
import {
  hasStoredSecrets,
  getSessionPassphrase,
  loadInstallStatus,
  loadBrand,
} from "@/lib/config-store";
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

type Brief = {
  id: string;
  slot_start: string;
  topic: string;
  caption: string;
  status: string;
  image_url: string | null;
};

type Stats = {
  posts7d: number;
  briefsPending: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
};

function Dashboard() {
  const [ready, setReady] = useState(false);
  const [hasCreds, setHasCreds] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const brand = useMemo(() => loadBrand(), []);

  useEffect(() => {
    (async () => {
      const creds = hasStoredSecrets();
      const inst = loadInstallStatus();
      const unl = !!getSessionPassphrase();
      setHasCreds(creds);
      setInstalled(inst.schemaVersion > 0);
      setUnlocked(unl);
      if (!creds || !unl || inst.schemaVersion === 0) {
        setReady(true);
        return;
      }
      try {
        const sb = await getUserSupabase();
        if (!sb) throw new Error("Could not initialize Supabase client.");
        const [briefRes, postRes, snapRes] = await Promise.all([
          sb.from("content_briefs").select("id, slot_start, topic, caption, status, image_url").order("slot_start").limit(5),
          sb.from("posts").select("id, published_at").gte("published_at", new Date(Date.now() - 7 * 86400_000).toISOString()),
          sb.from("engagement_snapshots").select("likes, comments, shares").order("captured_at", { ascending: false }).limit(100),
        ]);
        if (briefRes.error) throw briefRes.error;
        setBriefs((briefRes.data ?? []) as Brief[]);
        const snaps = (snapRes.data ?? []) as { likes: number; comments: number; shares: number }[];
        setStats({
          posts7d: (postRes.data ?? []).length,
          briefsPending: (briefRes.data ?? []).filter((b) => b.status === "draft").length,
          totalLikes: snaps.reduce((a, s) => a + (s.likes ?? 0), 0),
          totalComments: snaps.reduce((a, s) => a + (s.comments ?? 0), 0),
          totalShares: snaps.reduce((a, s) => a + (s.shares ?? 0), 0),
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  if (!ready) return <AppShell><LoadingSkeleton /></AppShell>;

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

  if (!installed) {
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
          <p className="text-sm text-destructive">{error}</p>
        </GlassCard>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat icon={<CalendarDaysIcon className="h-5 w-5" />} label="Published 7d" value={stats?.posts7d ?? 0} />
        <Stat icon={<ClockIcon className="h-5 w-5" />} label="Briefs pending" value={stats?.briefsPending ?? 0} />
        <Stat icon={<HeartIcon className="h-5 w-5" />} label="Likes (recent)" value={stats?.totalLikes ?? 0} accent="aurora" />
        <Stat icon={<ChatBubbleLeftIcon className="h-5 w-5" />} label="Comments" value={stats?.totalComments ?? 0} />
      </div>

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
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <GlassCard key={i} className="p-5">
          <div className="h-3 w-20 rounded shimmer-bg" />
          <div className="mt-4 h-7 w-16 rounded shimmer-bg" />
        </GlassCard>
      ))}
    </div>
  );
}
