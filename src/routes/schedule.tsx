import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { useMemo, useState, useCallback } from "react";
import { loadBrand, loadInstallStatus, getSessionPassphrase } from "@/lib/config-store";
import { useScheduleData, type ScheduleBrief, type Page } from "@/hooks/useAuroraQuery";
import { getUserSupabase } from "@/lib/user-supabase";
import { addDays, addMinutes, format, isSameDay, startOfDay } from "date-fns";
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
import { proxyFetch } from "@/lib/proxy-fetch";
import { toast } from "sonner";
import { WeekGrid } from "@/features/schedule/WeekGrid";
import { TimelineList } from "@/features/schedule/TimelineList";
import { BriefEditor } from "@/features/schedule/BriefEditor";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [{ title: "Schedule — Aurora" }, { name: "description", content: "Plan, edit, and reschedule Facebook posts with drag-and-drop and a real Facebook preview." }] }),
  component: SchedulePage,
});

type ViewMode = "week" | "list";

function SchedulePage() {
  const [pageId, setPageId] = useState<string>("");
  const [editing, setEditing] = useState<ScheduleBrief | null>(null);
  const [previewing, setPreviewing] = useState<ScheduleBrief | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [search, setSearch] = useState("");
  const brand = useMemo(() => loadBrand(), []);
  const inst = useMemo(() => loadInstallStatus(), []);
  const unlocked = !!getSessionPassphrase();

  const weekDays = useMemo(() => {
    const start = addDays(startOfDay(new Date()), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekOffset]);

  const { data, isLoading } = useScheduleData(weekDays, pageId);
  const pages = data?.pages ?? [];
  const allBriefs = data?.briefs ?? [];
  const briefs = useMemo(() => {
    if (!search.trim()) return allBriefs;
    const q = search.toLowerCase();
    return allBriefs.filter(
      (b) =>
        b.topic?.toLowerCase().includes(q) ||
        b.caption?.toLowerCase().includes(q) ||
        b.hashtags?.some((h) => h.toLowerCase().includes(q))
    );
  }, [allBriefs, search]);
  const effectivePageId = pageId || pages[0]?.id || "";

  const currentPage = pages.find((p) => p.id === effectivePageId);

  const nextSuggestedSlot = useCallback(
    (forDay: Date): Date => {
      const used = briefs
        .filter((b) => isSameDay(new Date(b.slot_start), forDay))
        .map((b) => new Date(b.slot_start).getTime());
      const windows = brand.postingWindows.length ? brand.postingWindows : [{ hour: 9, minute: 0 }];
      for (const w of windows) {
        const t = new Date(forDay);
        t.setHours(w.hour, w.minute, 0, 0);
        if (!used.includes(t.getTime())) return t;
      }
      const last = used.length ? new Date(Math.max(...used)) : new Date(forDay).setHours(9, 0, 0, 0);
      return addMinutes(new Date(last), 120);
    },
    [briefs, brand.postingWindows]
  );

  const createBriefAt = useCallback(
    async (slot: Date) => {
      if (!effectivePageId) return;
      const sb = await getUserSupabase();
      if (!sb) return;
      const { data, error } = await sb
        .from("content_briefs")
        .insert({
          page_id: effectivePageId,
          slot_start: slot.toISOString(),
          topic: "",
          caption: "",
          hashtags: [],
          image_prompt: "",
          status: "draft",
        })
        .select("*")
        .single();
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Brief created!");
      setEditing(data as ScheduleBrief);
    },
    [effectivePageId]
  );

  const patchBrief = useCallback(async (id: string, patch: Partial<ScheduleBrief>) => {
    const sb = await getUserSupabase();
    if (!sb) return;
    const { error } = await sb.from("content_briefs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) {
      toast.error(error.message);
    }
  }, []);

  const saveBrief = useCallback(
    async (b: ScheduleBrief) => {
      await patchBrief(b.id, {
        topic: b.topic,
        caption: b.caption,
        hashtags: b.hashtags,
        image_prompt: b.image_prompt,
        image_url: b.image_url,
        status: b.status,
        slot_start: b.slot_start,
      });
      setEditing(null);
      toast.success("Brief saved!");
    },
    [patchBrief]
  );

  const deleteBrief = useCallback(
    async (id: string) => {
      const sb = await getUserSupabase();
      if (!sb) return;
      const { error } = await sb.from("content_briefs").delete().eq("id", id);
      if (error) {
        toast.error(error.message);
        return;
      }
      setEditing(null);
      toast.info("Brief deleted.");
    },
    []
  );

  const generateCaption = useCallback(
    async (b: ScheduleBrief) => {
      setGenerating(b.id);
      try {
        const { getSessionPassphrase: gp, loadSecrets: ls } = await import("@/lib/config-store");
        const pass = gp();
        const secrets = pass ? await ls(pass) : null;
        if (!secrets?.aiApiKey) throw new Error("Add an LLM API key in Settings ▸ Secrets first.");
        const providers = await import("@/lib/config-store").then((m) => m.loadProviders());
        const baseUrl = providers.llm.baseUrl || defaultBaseUrl(providers.llm.type);
        if (!baseUrl) throw new Error("Configure a Base URL for the custom provider.");
        const sys = `You are a social media copywriter for the brand "${brand.brandName || "the brand"}".
Voice: ${brand.voice || "warm, knowledgeable"}.
Audience: ${brand.audience || "general"}.
Write JSON only: {"topic": string, "caption": string, "hashtags": string[], "image_prompt": string}.
Caption ≤ 280 chars. 5-8 lowercase hashtags. Image prompt is a vivid scene description.`;
        const user = `Topic seed: ${b.topic || "anything that fits the brand"}. Slot: ${format(new Date(b.slot_start), "EEEE HH:mm")}.`;
        const r = await proxyFetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${secrets.aiApiKey}` },
          body: JSON.stringify({
            model: providers.llm.model,
            messages: [{ role: "system", content: sys }, { role: "user", content: user }],
            response_format: { type: "json_object" },
            temperature: 0.7,
          }),
        });
        const j = await r.json<{ choices?: { message?: { content?: string } }[]; error?: { message?: string } }>();
        if (!r.ok) throw new Error(j.error?.message ?? "LLM call failed.");
        const content = j.choices?.[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(extractJSON(content));
        const updated: ScheduleBrief = {
          ...b,
          topic: parsed.topic || b.topic,
          caption: parsed.caption || b.caption,
          hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : b.hashtags,
          image_prompt: parsed.image_prompt || b.image_prompt,
        };
        setEditing(updated);
        toast.success("Content generated!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setGenerating(null);
      }
    },
    [brand]
  );

  function onDragStart(e: React.DragEvent, b: ScheduleBrief) {
    e.dataTransfer.setData("text/brief-id", b.id);
    e.dataTransfer.effectAllowed = "move";
  }

  async function onDropOnDay(e: React.DragEvent, day: Date) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/brief-id");
    const b = briefs.find((x) => x.id === id);
    if (!b) return;
    const cur = new Date(b.slot_start);
    if (isSameDay(cur, day)) return;
    const next = new Date(day);
    next.setHours(cur.getHours(), cur.getMinutes(), 0, 0);
    await patchBrief(b.id, { slot_start: next.toISOString() });
    toast.success("Brief moved!");
  }

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
            value={effectivePageId}
            onChange={(e) => setPageId(e.target.value)}
            className="glass-input h-9 rounded-xl px-3 text-xs"
            aria-label="Select page"
          >
            {pages.map((p) => <option key={p.id} value={p.id} className="bg-background">{p.fb_page_name}</option>)}
          </select>
        ) : null}
        {allBriefs.length > 0 && (
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
          onQuickTime={(b, mins) => patchBrief(b.id, { slot_start: addMinutes(new Date(b.slot_start), mins).toISOString() })}
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

function extractJSON(s: string): string {
  const m = s.match(/\{[\s\S]*\}/);
  return m ? m[0] : s;
}

function defaultBaseUrl(t: string): string {
  switch (t) {
    case "openai": return "https://api.openai.com/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "nvidia": return "https://integrate.api.nvidia.com/v1";
    case "groq": return "https://api.groq.com/openai/v1";
    case "anthropic": return "https://api.anthropic.com/v1";
    case "ollama": return "http://localhost:11434/v1";
    case "lm_studio": return "http://localhost:1234/v1";
    default: return "";
  }
}
