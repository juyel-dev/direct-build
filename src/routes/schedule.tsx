import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { useMemo } from "react";
import { loadInstallStatus, getSessionPassphrase } from "@/lib/config-store";
import { useSchedule } from "@/hooks/useSchedule";
import { format } from "date-fns";
import {
  PlusIcon,
  SparklesIcon,
  CheckIcon,
  TrashIcon,
  CalendarDaysIcon,
  Squares2X2Icon,
  ListBulletIcon,
  EyeIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { WeekGrid } from "@/features/schedule/WeekGrid";
import { TimelineList } from "@/features/schedule/TimelineList";
import { BriefEditor } from "@/features/schedule/BriefEditor";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [{ title: "Schedule — Aurora" }, { name: "description", content: "Plan, edit, and reschedule Facebook posts with drag-and-drop and a real Facebook preview." }] }),
  component: SchedulePage,
});

function SchedulePage() {
    const {
    pageId,
    pages,
    briefs,
    currentPage,
    editing,
    previewing,
    generating,
    view,
    weekDays,
    search,
    isLoading,
    brand,
    setPageId,
    setEditing,
    setPreviewing,
    setView,
    setWeekOffset,
    setSearch,
    createBriefAt,
    saveBrief,
    deleteBrief,
    generateCaption,
    onDragStart,
    onDropOnDay,
    nextSuggestedSlot,
    quickTimeAdjust,
  } = useSchedule();

  const inst = useMemo(() => loadInstallStatus(), []);
  const unlocked = !!getSessionPassphrase();

  if (inst.schemaVersion === 0 || !unlocked) {
    return (
      <AppShell>
        <GlassPanel title="Schedule unavailable" description="Run setup and unlock your credentials first.">
          <Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>
        </GlassPanel>
      </AppShell>
    );
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="mb-8">
          <div className="h-3 w-24 rounded shimmer-bg" />
          <div className="mt-2 h-8 w-32 rounded shimmer-bg" />
        </div>
        <div className="glass rounded-2xl p-4 shimmer-bg h-40" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Content calendar</p>
          <h1 className="mt-1 truncate text-2xl sm:text-3xl font-display font-medium gradient-text">Schedule</h1>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="glass rounded-xl p-0.5 flex">
            <button
              onClick={() => setView("week")}
              className={`h-8 px-2.5 rounded-lg text-xs inline-flex items-center gap-1.5 ${view === "week" ? "bg-white/15" : "text-muted-foreground"}`}
              title="Week view"
              aria-label="Week view"
            ><Squares2X2Icon className="h-3.5 w-3.5" /> Week</button>
            <button
              onClick={() => setView("list")}
              className={`h-8 px-2.5 rounded-lg text-xs inline-flex items-center gap-1.5 ${view === "list" ? "bg-white/15" : "text-muted-foreground"}`}
              title="Timeline list"
              aria-label="List view"
            ><ListBulletIcon className="h-3.5 w-3.5" /> List</button>
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="glass rounded-xl flex items-center">
          <button onClick={() => setWeekOffset((n) => n - 1)} className="h-9 w-9 grid place-items-center hover:bg-white/10 rounded-l-xl" aria-label="Previous week">‹</button>
          <button onClick={() => setWeekOffset(0)} className="h-9 px-3 text-xs hover:bg-white/10 inline-flex items-center gap-1.5">
            <CalendarDaysIcon className="h-3.5 w-3.5" />
            {format(weekDays[0], "MMM d")} – {format(weekDays[6], "MMM d")}
          </button>
          <button onClick={() => setWeekOffset((n) => n + 1)} className="h-9 w-9 grid place-items-center hover:bg-white/10 rounded-r-xl" aria-label="Next week">›</button>
        </div>
        {pages.length > 1 ? (
          <select
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className="glass-input h-9 rounded-xl px-3 text-xs"
            aria-label="Select page"
          >
            {pages.map((p) => <option key={p.id} value={p.id} className="bg-background">{p.fb_page_name}</option>)}
          </select>
        ) : null}
        {briefs.length > 0 && (
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search briefs..."
              className="glass-input h-9 rounded-xl pl-8 pr-3 text-xs w-40"
              aria-label="Search briefs"
            />
          </div>
        )}
        <div className="flex-1" />
        <GlassButton
          variant="primary"
          size="sm"
          onClick={() => createBriefAt(nextSuggestedSlot(weekDays[0]))}
        >
          <PlusIcon className="h-4 w-4" /> New post
        </GlassButton>
      </div>

      {pages.length === 0 && (
        <GlassPanel title="No Facebook page yet" description="Add a Page Access Token + Page ID in Secrets, then re-run Setup to seed the page row.">
          <Link to="/settings"><GlassButton variant="primary">Open Secrets</GlassButton></Link>
        </GlassPanel>
      )}

      {pages.length > 0 && view === "week" && (
        <WeekGrid
          days={weekDays}
          briefs={briefs}
          onAdd={(d) => createBriefAt(nextSuggestedSlot(d))}
          onOpen={(b) => setEditing(b)}
          onPreview={(b) => setPreviewing(b)}
          onDragStart={onDragStart}
          onDrop={onDropOnDay}
          onQuickTime={(b, mins) => quickTimeAdjust(b.id, b.slot_start, mins)}
        />
      )}

      {pages.length > 0 && view === "list" && (
        <TimelineList
          days={weekDays}
          briefs={briefs}
          onOpen={(b) => setEditing(b)}
          onPreview={(b) => setPreviewing(b)}
          onAdd={(d) => createBriefAt(nextSuggestedSlot(d))}
        />
      )}

      <BottomSheet
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing ? "Edit post" : ""}
        description={editing ? format(new Date(editing.slot_start), "EEEE, MMM d · h:mm a") : undefined}
        footer={
          editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <GlassButton variant="primary" onClick={() => saveBrief(editing)}><CheckIcon className="h-4 w-4" /> Save</GlassButton>
              <GlassButton variant="subtle" loading={generating === editing.id} onClick={() => generateCaption(editing)}>
                <SparklesIcon className="h-4 w-4" /> AI assist
              </GlassButton>
              <GlassButton variant="subtle" onClick={() => { setPreviewing(editing); }}>
                <EyeIcon className="h-4 w-4" /> Preview
              </GlassButton>
              <div className="flex-1" />
              <GlassButton variant="ghost" onClick={() => deleteBrief(editing.id)}>
                <TrashIcon className="h-4 w-4 text-destructive" />
              </GlassButton>
            </div>
          ) : null
        }
      >
        {editing ? (
          <BriefEditor
            brief={editing}
            onChange={setEditing}
            pageName={currentPage?.fb_page_name ?? brand.brandName ?? "Your Page"}
            postingWindows={brand.postingWindows}
          />
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={!!previewing}
        onOpenChange={(v) => !v && setPreviewing(null)}
        title="Facebook preview"
        description="How this post will look on Facebook."
      >
        {previewing ? (
          <div className="max-w-md mx-auto">
            <FacebookPreview
              pageName={currentPage?.fb_page_name ?? brand.brandName ?? "Your Page"}
              caption={previewing.caption}
              hashtags={previewing.hashtags}
              imageUrl={previewing.image_url}
              scheduledFor={new Date(previewing.slot_start)}
            />
          </div>
        ) : null}
      </BottomSheet>
    </AppShell>
  );
}
