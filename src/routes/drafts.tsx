import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { useEffect, useMemo, useState, useCallback } from "react";
import { getUserSupabase } from "@/lib/user-supabase";
import { loadBrand, loadInstallStatus, getSessionPassphrase, hasStoredSecrets } from "@/lib/config-store";
import {
  CheckCircleIcon,
  XMarkIcon,
  PencilIcon,
  SparklesIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { format } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/drafts")({
  head: () => ({
    meta: [
      { title: "Drafts — Aurora" },
      { name: "description", content: "Review and approve AI-generated content drafts." },
    ],
  }),
  component: DraftsPage,
});

type Draft = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  image_url: string | null;
  status: string;
  created_at: string;
};

function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageName, setPageName] = useState("");
  const brand = useMemo(() => loadBrand(), []);

  const fetchDrafts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const pass = getSessionPassphrase();
      if (!pass || !hasStoredSecrets()) return;
      const sb = await getUserSupabase();
      if (!sb) return;

      const install = loadInstallStatus();
      if (install.schemaVersion === 0) return;

      const [briefRes, pageRes] = await Promise.all([
        sb
          .from("content_briefs")
          .select("id, page_id, slot_start, topic, caption, hashtags, image_prompt, image_url, status, created_at")
          .eq("status", "draft")
          .order("slot_start", { ascending: true }),
        sb.from("pages").select("fb_page_name").limit(1).maybeSingle(),
      ]);

      if (briefRes.error) throw briefRes.error;
      setDrafts((briefRes.data ?? []) as Draft[]);
      if (pageRes.data) setPageName((pageRes.data as { fb_page_name: string }).fb_page_name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const handleApprove = async (draftId: string) => {
    try {
      const sb = await getUserSupabase();
      if (!sb) return;
      const { error } = await sb
        .from("content_briefs")
        .update({ status: "approved", approved_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", draftId);
      if (error) throw error;
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.success("Draft approved! It will be published at the scheduled time.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve draft");
    }
  };

  const handleReject = async (draftId: string) => {
    try {
      const sb = await getUserSupabase();
      if (!sb) return;
      const { error } = await sb
        .from("content_briefs")
        .update({ status: "skipped", updated_at: new Date().toISOString() })
        .eq("id", draftId);
      if (error) throw error;
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.info("Draft rejected.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject draft");
    }
  };

  const pass = getSessionPassphrase();
  if (!pass || !hasStoredSecrets()) {
    return (
      <AppShell>
        <EmptyState
          title="Unlock to view drafts"
          subtitle="Enter your passphrase in Settings to access your drafts."
          cta={<Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>}
        />
      </AppShell>
    );
  }

  const install = loadInstallStatus();
  if (install.schemaVersion === 0) {
    return (
      <AppShell>
        <EmptyState
          title="Run Setup first"
          subtitle="Aurora needs to provision your database before showing drafts."
          cta={<Link to="/settings"><GlassButton variant="primary">Run Setup</GlassButton></Link>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Review</p>
          <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium">
            <span className="gradient-text">Drafts</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated content waiting for your approval.
          </p>
        </div>
        <GlassButton variant="secondary" size="sm" onClick={fetchDrafts} disabled={loading}>
          <ArrowPathIcon className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </GlassButton>
      </div>

      {error && (
        <GlassCard className="p-4 mb-6 border-destructive/30">
          <p className="text-sm text-destructive">{error}</p>
        </GlassCard>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassCard key={i} className="p-5">
              <div className="h-4 w-32 rounded shimmer-bg" />
              <div className="mt-3 h-3 w-full rounded shimmer-bg" />
              <div className="mt-2 h-3 w-3/4 rounded shimmer-bg" />
            </GlassCard>
          ))}
        </div>
      ) : drafts.length === 0 ? (
        <EmptyState
          title="No drafts pending"
          subtitle="When the AI generates content, it will appear here for your review."
          icon={<CheckCircleIcon className="h-12 w-12 text-muted-foreground/30" />}
        />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/15 px-2.5 py-1 text-xs font-medium text-primary">
              {drafts.length} pending
            </span>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                pageName={pageName || brand.brandName || "Your Page"}
                onApprove={() => handleApprove(draft.id)}
                onReject={() => handleReject(draft.id)}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function DraftCard({
  draft,
  pageName,
  onApprove,
  onReject,
}: {
  draft: Draft;
  pageName: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassCard className="overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
              draft
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(draft.slot_start), "MMM d, HH:mm")}
            </span>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? "Less" : "More"}
          </button>
        </div>

        <h3 className="text-sm font-semibold mb-1">{draft.topic || "Untitled"}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
          {draft.caption || "No caption yet."}
        </p>

        {expanded && (
          <div className="mb-3 space-y-2">
            {draft.hashtags && draft.hashtags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {draft.hashtags.map((tag: string, i: number) => (
                  <span key={i} className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {tag.startsWith("#") ? tag : `#${tag}`}
                  </span>
                ))}
              </div>
            )}
            {draft.image_prompt && (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium">Image prompt:</span> {draft.image_prompt}
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          <GlassButton variant="primary" size="sm" onClick={onApprove}>
            <CheckCircleIcon className="h-3.5 w-3.5" /> Approve
          </GlassButton>
          <GlassButton variant="destructive" size="sm" onClick={onReject}>
            <XMarkIcon className="h-3.5 w-3.5" /> Reject
          </GlassButton>
          <Link to="/compose" search={{ briefId: draft.id }}>
            <GlassButton variant="ghost" size="sm">
              <PencilIcon className="h-3.5 w-3.5" /> Edit
            </GlassButton>
          </Link>
        </div>
      </div>

      {(draft.image_url || expanded) && (
        <div className="border-t border-white/5 p-4">
          <FacebookPreview
            pageName={pageName}
            caption={draft.caption}
            hashtags={draft.hashtags}
            imageUrl={draft.image_url}
            scheduledFor={new Date(draft.slot_start)}
          />
        </div>
      )}
    </GlassCard>
  );
}

function EmptyState({
  title,
  subtitle,
  cta,
  icon,
}: {
  title: string;
  subtitle: string;
  cta?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <GlassCard className="p-12 text-center">
      {icon || <SparklesIcon className="mx-auto h-12 w-12 text-muted-foreground/30" />}
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">{subtitle}</p>
      {cta && <div className="mt-6">{cta}</div>}
    </GlassCard>
  );
}
