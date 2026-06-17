import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassLabel, GlassTextarea } from "@/components/glass/GlassInput";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { useEffect, useMemo, useState } from "react";
import { getUserSupabase } from "@/lib/user-supabase";
import { getSessionPassphrase, loadBrand, loadInstallStatus, loadProviders, loadSecrets } from "@/lib/config-store";
import { addDays, addMinutes, format, isSameDay, startOfDay } from "date-fns";
import {
  PlusIcon, SparklesIcon, CheckIcon, TrashIcon, ClockIcon,
  CalendarDaysIcon, Squares2X2Icon, ListBulletIcon, EyeIcon, PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { proxyFetch } from "@/lib/proxy-fetch";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [{ title: "Schedule — Aurora" }, { name: "description", content: "Plan, edit, and reschedule Facebook posts with drag-and-drop and a real Facebook preview." }] }),
  component: SchedulePage,
});

type Brief = {
  id: string;
  page_id: string;
  slot_start: string;
  topic: string;
  caption: string;
  hashtags: string[];
  image_prompt: string;
  image_url: string | null;
  status: string;
};

type Page = { id: string; fb_page_name: string };
type ViewMode = "week" | "list";

const STATUSES = ["draft", "approved", "scheduled", "published", "skipped", "failed"] as const;

function SchedulePage() {
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState<string>("");
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [editing, setEditing] = useState<Brief | null>(null);
  const [previewing, setPreviewing] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const brand = useMemo(() => loadBrand(), []);
  const inst = useMemo(() => loadInstallStatus(), []);
  const unlocked = !!getSessionPassphrase();

  const weekDays = useMemo(() => {
    const start = addDays(startOfDay(new Date()), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekOffset]);

  async function loadAll() {
    const sb = await getUserSupabase();
    if (!sb) return;
    const { data: pData, error: pErr } = await sb.from("pages").select("id, fb_page_name");
    if (pErr) { setError(pErr.message); return; }
    const list = (pData ?? []) as Page[];
    setPages(list);
    const pid = pageId || list[0]?.id || "";
    setPageId(pid);
    if (!pid) { setBriefs([]); setReady(true); return; }
    const { data: bData, error: bErr } = await sb
      .from("content_briefs")
      .select("*")
      .eq("page_id", pid)
      .gte("slot_start", weekDays[0].toISOString())
      .lt("slot_start", addDays(weekDays[6], 1).toISOString())
      .order("slot_start");
    if (bErr) { setError(bErr.message); setReady(true); return; }
    setBriefs((bData ?? []) as Brief[]);
    setReady(true);
  }

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [pageId, weekOffset]);

  if (inst.schemaVersion === 0 || !unlocked) {
    return (
      <AppShell>
        <GlassPanel title="Schedule unavailable" description="Run setup and unlock your credentials first.">
          <Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>
        </GlassPanel>
      </AppShell>
    );
  }

  function nextSuggestedSlot(forDay: Date): Date {
    const used = briefs
      .filter((b) => isSameDay(new Date(b.slot_start), forDay))
      .map((b) => new Date(b.slot_start).getTime());
    const windows = brand.postingWindows.length ? brand.postingWindows : [{ hour: 9, minute: 0 }];
    for (const w of windows) {
      const t = new Date(forDay);
      t.setHours(w.hour, w.minute, 0, 0);
      if (!used.includes(t.getTime())) return t;
    }
    // fallback: 2 hours after last used
    const last = used.length ? new Date(Math.max(...used)) : new Date(forDay).setHours(9, 0, 0, 0);
    return addMinutes(new Date(last), 120);
  }

  async function createBriefAt(slot: Date) {
    if (!pageId) return;
    const sb = await getUserSupabase();
    if (!sb) return;
    const { data, error } = await sb
      .from("content_briefs")
      .insert({
        page_id: pageId,
        slot_start: slot.toISOString(),
        topic: "",
        caption: "",
        hashtags: [],
        image_prompt: "",
        status: "draft",
      })
      .select("*")
      .single();
    if (error) { setError(error.message); return; }
    const created = data as Brief;
    setBriefs((b) => [...b, created].sort((a, z) => a.slot_start.localeCompare(z.slot_start)));
    setEditing(created);
  }

  async function patchBrief(id: string, patch: Partial<Brief>) {
    const sb = await getUserSupabase();
    if (!sb) return;
    const { error } = await sb.from("content_briefs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { setError(error.message); return; }
    setBriefs((list) =>
      list.map((x) => (x.id === id ? ({ ...x, ...patch } as Brief) : x))
        .sort((a, z) => a.slot_start.localeCompare(z.slot_start))
    );
  }

  async function saveBrief(b: Brief) {
    await patchBrief(b.id, {
      topic: b.topic, caption: b.caption, hashtags: b.hashtags,
      image_prompt: b.image_prompt, image_url: b.image_url,
      status: b.status, slot_start: b.slot_start,
    });
    setEditing(null);
  }

  async function deleteBrief(id: string) {
    const sb = await getUserSupabase();
    if (!sb) return;
    const { error } = await sb.from("content_briefs").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setBriefs((b) => b.filter((x) => x.id !== id));
    setEditing(null);
  }

  async function generateCaption(b: Brief) {
    setGenerating(b.id);
    setError(null);
    try {
      const pass = getSessionPassphrase();
      const secrets = pass ? await loadSecrets(pass) : null;
      if (!secrets?.aiApiKey) throw new Error("Add an LLM API key in Settings ▸ Secrets first.");
      const providers = loadProviders();
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
      const updated: Brief = {
        ...b,
        topic: parsed.topic || b.topic,
        caption: parsed.caption || b.caption,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : b.hashtags,
        image_prompt: parsed.image_prompt || b.image_prompt,
      };
      setEditing(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(null);
    }
  }

  // Drag handlers — move a brief to another day, keeping its time-of-day
  function onDragStart(e: React.DragEvent, b: Brief) {
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
  }
  const currentPage = pages.find((p) => p.id === pageId);

  if (!ready) return <AppShell><div className="glass rounded-2xl p-8 shimmer-bg h-40" /></AppShell>;

  return (
    <AppShell>
      {/* Header */}
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
            ><Squares2X2Icon className="h-3.5 w-3.5" /> Week</button>
            <button
              onClick={() => setView("list")}
              className={`h-8 px-2.5 rounded-lg text-xs inline-flex items-center gap-1.5 ${view === "list" ? "bg-white/15" : "text-muted-foreground"}`}
              title="Timeline list"
            ><ListBulletIcon className="h-3.5 w-3.5" /> List</button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
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
          >
            {pages.map((p) => <option key={p.id} value={p.id} className="bg-background">{p.fb_page_name}</option>)}
          </select>
        ) : null}
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

      {error && <div className="mb-4 text-sm text-destructive glass rounded-xl p-3">{error}</div>}

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

/* =========================== Week grid =========================== */

function WeekGrid({
  days, briefs, onAdd, onOpen, onPreview, onDragStart, onDrop, onQuickTime,
}: {
  days: Date[];
  briefs: Brief[];
  onAdd: (d: Date) => void;
  onOpen: (b: Brief) => void;
  onPreview: (b: Brief) => void;
  onDragStart: (e: React.DragEvent, b: Brief) => void;
  onDrop: (e: React.DragEvent, d: Date) => void;
  onQuickTime: (b: Brief, deltaMinutes: number) => void;
}) {
  const today = new Date();
  return (
    <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((d) => {
        const dayBriefs = briefs.filter((b) => isSameDay(new Date(b.slot_start), d));
        const isToday = isSameDay(d, today);
        return (
          <div
            key={d.toISOString()}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => onDrop(e, d)}
            className={`glass rounded-xl p-2 flex flex-col min-h-[140px] ${isToday ? "ring-1 ring-primary/40" : ""}`}
          >
            <div className="flex items-center justify-between mb-2 px-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{format(d, "EEE")}</span>
                <span className={`font-display text-lg leading-none ${isToday ? "text-primary" : ""}`}>{format(d, "d")}</span>
              </div>
              <button
                onClick={() => onAdd(d)}
                className="rounded-md h-6 w-6 grid place-items-center hover:bg-white/10 text-muted-foreground"
                title="Add post"
              ><PlusIcon className="h-3.5 w-3.5" /></button>
            </div>

            <div className="space-y-1.5 flex-1">
              {dayBriefs.length === 0 && (
                <button
                  onClick={() => onAdd(d)}
                  className="w-full h-full min-h-[60px] text-[11px] text-muted-foreground/60 rounded-lg border border-dashed border-white/10 hover:border-primary/40 hover:text-foreground transition"
                >
                  + add
                </button>
              )}
              {dayBriefs.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => onDragStart(e, b)}
                  className="group rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 p-2 cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between gap-1">
                    <button
                      onClick={() => onQuickTime(b, -15)}
                      title="−15 min"
                      className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
                    >−</button>
                    <button
                      onClick={() => onOpen(b)}
                      className="flex-1 min-w-0 text-left flex items-center gap-1"
                    >
                      <ClockIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-[11px] tabular-nums">{format(new Date(b.slot_start), "h:mm a")}</span>
                      <StatusDot status={b.status} />
                    </button>
                    <button
                      onClick={() => onQuickTime(b, 15)}
                      title="+15 min"
                      className="text-[10px] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition"
                    >+</button>
                  </div>
                  <button onClick={() => onOpen(b)} className="w-full text-left mt-1">
                    <p className="text-xs font-medium line-clamp-2 leading-snug">
                      {b.topic || b.caption?.slice(0, 60) || <span className="text-muted-foreground/70 italic">Untitled</span>}
                    </p>
                  </button>
                  <div className="mt-1.5 flex items-center gap-1">
                    <button onClick={() => onOpen(b)} className="h-5 px-1.5 rounded text-[10px] text-muted-foreground hover:bg-white/10 inline-flex items-center gap-1">
                      <PencilSquareIcon className="h-3 w-3" /> Edit
                    </button>
                    <button onClick={() => onPreview(b)} className="h-5 px-1.5 rounded text-[10px] text-muted-foreground hover:bg-white/10 inline-flex items-center gap-1">
                      <EyeIcon className="h-3 w-3" /> Preview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* =========================== Timeline list =========================== */

function TimelineList({
  days, briefs, onOpen, onPreview, onAdd,
}: {
  days: Date[];
  briefs: Brief[];
  onOpen: (b: Brief) => void;
  onPreview: (b: Brief) => void;
  onAdd: (d: Date) => void;
}) {
  return (
    <div className="space-y-3">
      {days.map((d) => {
        const list = briefs.filter((b) => isSameDay(new Date(b.slot_start), d));
        const isToday = isSameDay(d, new Date());
        return (
          <div key={d.toISOString()} className="glass rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-baseline gap-2">
                <span className={`font-display text-lg ${isToday ? "text-primary" : ""}`}>{format(d, "EEE d")}</span>
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{format(d, "MMM")}</span>
                {list.length > 0 && <span className="text-[10px] text-muted-foreground">· {list.length} post{list.length !== 1 ? "s" : ""}</span>}
              </div>
              <button onClick={() => onAdd(d)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <PlusIcon className="h-3.5 w-3.5" /> Add
              </button>
            </div>
            {list.length === 0 ? (
              <p className="text-xs text-muted-foreground/70 italic">Nothing scheduled.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {list.map((b) => (
                  <li key={b.id} className="py-2 flex items-center gap-3">
                    <div className="w-16 tabular-nums text-sm text-muted-foreground shrink-0">{format(new Date(b.slot_start), "h:mm a")}</div>
                    <StatusDot status={b.status} />
                    <button onClick={() => onOpen(b)} className="flex-1 min-w-0 text-left">
                      <p className="text-sm truncate">{b.topic || b.caption?.slice(0, 80) || <span className="italic text-muted-foreground/70">Untitled</span>}</p>
                    </button>
                    <button onClick={() => onPreview(b)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0">
                      <EyeIcon className="h-3.5 w-3.5" /> Preview
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* =========================== Editor body =========================== */

function BriefEditor({
  brief, onChange, pageName, postingWindows,
}: {
  brief: Brief;
  onChange: (b: Brief) => void;
  pageName: string;
  postingWindows: { hour: number; minute: number }[];
}) {
  const slot = new Date(brief.slot_start);
  const localValue = toLocalInputValue(slot);

  function setSlot(d: Date) {
    onChange({ ...brief, slot_start: d.toISOString() });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="grid gap-4 min-w-0">
        <div>
          <GlassLabel>When</GlassLabel>
          <div className="grid gap-2">
            <input
              type="datetime-local"
              value={localValue}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                setSlot(new Date(v));
              }}
              className="glass-input block w-full min-w-0 h-11 rounded-xl px-3.5 text-sm text-foreground focus:outline-none focus:glass-input-focus"
            />
            <div className="flex flex-wrap gap-1.5">
              <TimeChip onClick={() => setSlot(addMinutes(slot, -15))}>−15m</TimeChip>
              <TimeChip onClick={() => setSlot(addMinutes(slot, 15))}>+15m</TimeChip>
              <TimeChip onClick={() => setSlot(addMinutes(slot, 60))}>+1h</TimeChip>
              <TimeChip onClick={() => setSlot(addDays(slot, 1))}>+1 day</TimeChip>
              {postingWindows.map((w, i) => (
                <TimeChip
                  key={i}
                  onClick={() => {
                    const d = new Date(slot);
                    d.setHours(w.hour, w.minute, 0, 0);
                    setSlot(d);
                  }}
                >
                  {format(new Date().setHours(w.hour, w.minute, 0, 0), "h:mm a")}
                </TimeChip>
              ))}
            </div>
          </div>
        </div>

        <div>
          <GlassLabel>Topic</GlassLabel>
          <GlassInput value={brief.topic} onChange={(e) => onChange({ ...brief, topic: e.target.value })} placeholder="e.g. New summer menu" />
        </div>

        <div>
          <GlassLabel hint={`${brief.caption.length} chars`}>Caption</GlassLabel>
          <GlassTextarea value={brief.caption} onChange={(e) => onChange({ ...brief, caption: e.target.value })} rows={5} placeholder="What do you want to say?" />
        </div>

        <div>
          <GlassLabel>Hashtags</GlassLabel>
          <GlassInput
            value={brief.hashtags.join(", ")}
            onChange={(e) => onChange({
              ...brief,
              hashtags: e.target.value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean),
            })}
            placeholder="coffee, espresso, morning"
          />
        </div>

        <div>
          <GlassLabel>Image URL</GlassLabel>
          <GlassInput value={brief.image_url ?? ""} onChange={(e) => onChange({ ...brief, image_url: e.target.value || null })} placeholder="https://…" />
        </div>

        <div>
          <GlassLabel>Image prompt (for AI generation)</GlassLabel>
          <GlassTextarea value={brief.image_prompt} onChange={(e) => onChange({ ...brief, image_prompt: e.target.value })} rows={2} />
        </div>

        <div>
          <GlassLabel>Status</GlassLabel>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => onChange({ ...brief, status: s })}
                className={`h-8 px-3 rounded-lg text-xs capitalize border transition ${
                  brief.status === s
                    ? "bg-primary/20 border-primary/40 text-foreground"
                    : "bg-white/[0.03] border-white/10 text-muted-foreground hover:bg-white/10"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Live FB preview */}
      <div className="min-w-0">
        <GlassLabel>Live preview</GlassLabel>
        <FacebookPreview
          pageName={pageName}
          caption={brief.caption}
          hashtags={brief.hashtags}
          imageUrl={brief.image_url}
          scheduledFor={slot}
        />
      </div>
    </div>
  );
}

function TimeChip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-7 px-2.5 rounded-lg text-[11px] bg-white/[0.04] border border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
    >
      {children}
    </button>
  );
}

function StatusDot({ status }: { status: string }) {
  const c =
    status === "published" ? "bg-success" :
    status === "approved" ? "bg-primary" :
    status === "scheduled" ? "bg-accent" :
    status === "failed" ? "bg-destructive" :
    status === "skipped" ? "bg-warning" :
    "bg-muted-foreground/40";
  return <span className={`h-1.5 w-1.5 rounded-full ${c} shrink-0`} title={status} />;
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
