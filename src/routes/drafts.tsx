import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput } from "@/components/glass/GlassInput";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useMemo, useState, useCallback, useEffect, memo } from "react";
import { loadBrand, loadInstallStatus, getSessionPassphrase, hasStoredSecrets } from "@/lib/config-store";
import {
  useDrafts,
  useApproveDraft,
  useRejectDraft,
  useBulkApproveDrafts,
  useBulkRejectDrafts,
  type Draft,
} from "@/hooks/useAuroraQuery";
import {
  CheckCircleIcon,
  XMarkIcon,
  PencilIcon,
  SparklesIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  CheckIcon,
  TrashIcon,
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
  component: () => (
    <ErrorBoundary fallbackTitle="Drafts page error">
      <DraftsPage />
    </ErrorBoundary>
  ),
});

function DraftsPage() {
  const brand = useMemo(() => loadBrand(), []);
  const pass = getSessionPassphrase();
  const hasCreds = hasStoredSecrets();
  const install = loadInstallStatus();

  const { data, isLoading, error, refetch } = useDrafts();
  const drafts = data?.drafts ?? [];
  const pageName = data?.pageName || brand.brandName || "Your Page";

  const approveMutation = useApproveDraft();
  const rejectMutation = useRejectDraft();
  const bulkApproveMutation = useBulkApproveDrafts();
  const bulkRejectMutation = useBulkRejectDrafts();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search.trim()) return drafts;
    const q = search.toLowerCase();
    return drafts.filter(
      (d) =>
        d.topic?.toLowerCase().includes(q) ||
        d.caption?.toLowerCase().includes(q) ||
        d.hashtags?.some((h) => h.toLowerCase().includes(q))
    );
  }, [drafts, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  }, [filtered, selected.size]);

  const handleApprove = useCallback(
    async (id: string) => {
      try {
        await approveMutation.mutateAsync(id);
        toast.success("Draft approved!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to approve");
      }
    },
    [approveMutation]
  );

  const handleReject = useCallback(
    async (id: string) => {
      try {
        await rejectMutation.mutateAsync(id);
        toast.info("Draft rejected.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to reject");
      }
    },
    [rejectMutation]
  );

  const handleBulkApprove = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      await bulkApproveMutation.mutateAsync(Array.from(selected));
      toast.success(`${selected.size} drafts approved!`);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to bulk approve");
    }
  }, [selected, bulkApproveMutation]);

  const handleBulkReject = useCallback(async () => {
    if (selected.size === 0) return;
    try {
      await bulkRejectMutation.mutateAsync(Array.from(selected));
      toast.info(`${selected.size} drafts rejected.`);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to bulk reject");
    }
  }, [selected, bulkRejectMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "a" && !e.ctrlKey && !e.metaKey && selected.size > 0) {
        selectAll();
      }
      if (e.key === "Escape") {
        setSelected(new Set());
        setSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected.size, selectAll]);

  if (!pass || !hasCreds) {
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
        <GlassButton variant="secondary" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <ArrowPathIcon className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </GlassButton>
      </div>

      {error && (
        <GlassCard className="p-4 mb-6 border-destructive/30">
          <p className="text-sm text-destructive">{error.message}</p>
        </GlassCard>
      )}

      {/* Search & Bulk Actions */}
      {drafts.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search drafts..."
              className="glass-input w-full h-9 rounded-xl pl-9 pr-3 text-sm"
              aria-label="Search drafts"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size > 0 ? `${selected.size} selected` : `${filtered.length} drafts`}
            </span>
            {selected.size > 0 && (
              <>
                <GlassButton variant="primary" size="sm" onClick={handleBulkApprove}>
                  <CheckIcon className="h-3.5 w-3.5" /> Approve ({selected.size})
                </GlassButton>
                <GlassButton variant="destructive" size="sm" onClick={handleBulkReject}>
                  <TrashIcon className="h-3.5 w-3.5" /> Reject ({selected.size})
                </GlassButton>
                <GlassButton variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Clear
                </GlassButton>
              </>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassCard key={i} className="p-5">
              <div className="h-4 w-32 rounded shimmer-bg" />
              <div className="mt-3 h-3 w-full rounded shimmer-bg" />
              <div className="mt-2 h-3 w-3/4 rounded shimmer-bg" />
            </GlassCard>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? "No matching drafts" : "No drafts pending"}
          subtitle={search ? "Try a different search term." : "When the AI generates content, it will appear here for your review."}
          icon={<CheckCircleIcon className="h-12 w-12 text-muted-foreground/30" />}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {filtered.map((draft) => (
            <DraftCard
              key={draft.id}
              draft={draft}
              pageName={pageName}
              selected={selected.has(draft.id)}
              onSelect={() => toggleSelect(draft.id)}
              onApprove={() => handleApprove(draft.id)}
              onReject={() => handleReject(draft.id)}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

const DraftCard = memo(function DraftCard({
  draft,
  pageName,
  selected,
  onSelect,
  onApprove,
  onReject,
}: {
  draft: Draft;
  pageName: string;
  selected: boolean;
  onSelect: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassCard className={`overflow-hidden transition-all ${selected ? "ring-2 ring-primary/50" : ""}`}>
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selected}
              onChange={onSelect}
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-primary"
              aria-label={`Select draft: ${draft.topic || "Untitled"}`}
            />
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
            caption={draft.caption ?? ""}
            hashtags={draft.hashtags ?? []}
            imageUrl={draft.image_url}
            scheduledFor={new Date(draft.slot_start)}
          />
        </div>
      )}
    </GlassCard>
  );
});

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
