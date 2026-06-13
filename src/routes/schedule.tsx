import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard, GlassPanel } from "@/components/glass/GlassCard";
import { GlassButton } from "@/components/glass/GlassButton";
import { GlassInput, GlassLabel, GlassTextarea } from "@/components/glass/GlassInput";
import { useEffect, useMemo, useState } from "react";
import { getUserSupabase } from "@/lib/user-supabase";
import { getSessionPassphrase, loadBrand, loadInstallStatus, loadProviders, loadSecrets } from "@/lib/config-store";
import { addDays, format, startOfDay } from "date-fns";
import { PlusIcon, SparklesIcon, CheckIcon, XMarkIcon, TrashIcon } from "@heroicons/react/24/outline";

export const Route = createFileRoute("/schedule")({
  head: () => ({ meta: [{ title: "Schedule — Aurora" }, { name: "description", content: "Weekly content schedule. Approve, edit, and skip AI-generated Facebook posts." }] }),
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

function SchedulePage() {
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageId, setPageId] = useState<string>("");
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [editing, setEditing] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState<string | null>(null);
  const brand = useMemo(() => loadBrand(), []);
  const inst = useMemo(() => loadInstallStatus(), []);
  const unlocked = !!getSessionPassphrase();

  const weekDays = useMemo(() => {
    const start = startOfDay(new Date());
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, []);

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

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [pageId]);

  if (inst.schemaVersion === 0 || !unlocked) {
    return (
      <AppShell>
        <GlassPanel title="Schedule unavailable" description="Run setup and unlock your credentials first.">
          <Link to="/settings"><GlassButton variant="primary">Open Settings</GlassButton></Link>
        </GlassPanel>
      </AppShell>
    );
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
    setBriefs((b) => [...b, data as Brief].sort((a, z) => a.slot_start.localeCompare(z.slot_start)));
    setEditing(data as Brief);
  }

  async function saveBrief(b: Brief) {
    const sb = await getUserSupabase();
    if (!sb) return;
    const { error } = await sb.from("content_briefs").update({
      topic: b.topic,
      caption: b.caption,
      hashtags: b.hashtags,
      image_prompt: b.image_prompt,
      image_url: b.image_url,
      status: b.status,
      updated_at: new Date().toISOString(),
    }).eq("id", b.id);
    if (error) { setError(error.message); return; }
    setBriefs((list) => list.map((x) => (x.id === b.id ? b : x)));
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
      const r = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${secrets.aiApiKey}` },
        body: JSON.stringify({
          model: providers.llm.model,
          messages: [{ role: "system", content: sys }, { role: "user", content: user }],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
      });
      const j = await r.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
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

  if (!ready) return <AppShell><div className="glass rounded-2xl p-8 shimmer-bg h-40" /></AppShell>;

  return (
    <AppShell>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">7-day window</p>
          <h1 className="mt-1 text-3xl md:text-4xl font-display font-medium gradient-text">Schedule</h1>
        </div>
        {pages.length > 0 ? (
          <select
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            className="glass-input h-10 rounded-xl px-3 text-sm"
          >
            {pages.map((p) => <option key={p.id} value={p.id} className="bg-background">{p.fb_page_name}</option>)}
          </select>
        ) : null}
      </div>

      {pages.length === 0 && (
        <GlassPanel title="No Facebook page yet" description="Add a Page Access Token + Page ID in Secrets, then re-run Setup to seed the page row.">
          <Link to="/settings"><GlassButton variant="primary">Open Secrets</GlassButton></Link>
        </GlassPanel>
      )}

      {error && <div className="mb-4 text-sm text-destructive glass rounded-xl p-3">{error}</div>}

      {pages.length > 0 && (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-7">
          {weekDays.map((d) => {
            const dayBriefs = briefs.filter((b) => sameDay(new Date(b.slot_start), d));
            return (
              <GlassCard key={d.toISOString()} className="p-3 min-h-[180px] flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{format(d, "EEE")}</p>
                    <p className="font-display text-xl leading-none">{format(d, "d")}</p>
                  </div>
                  <button
                    onClick={() => {
                      const win = brand.postingWindows[dayBriefs.length % brand.postingWindows.length];
                      const slot = new Date(d);
                      slot.setHours(win.hour, win.minute, 0, 0);
                      createBriefAt(slot);
                    }}
                    className="rounded-lg glass-input h-7 w-7 grid place-items-center hover:bg-white/10"
                    title="Add brief"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-1.5 flex-1">
                  {dayBriefs.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setEditing(b)}
                      className="w-full text-left glass rounded-lg p-2 hover:bg-white/10 transition"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{format(new Date(b.slot_start), "HH:mm")}</span>
                        <StatusDot status={b.status} />
                      </div>
                      <p className="mt-0.5 text-xs font-medium line-clamp-2">{b.topic || "Untitled"}</p>
                    </button>
                  ))}
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {editing && (
        <BriefEditor
          brief={editing}
          generating={generating === editing.id}
          onClose={() => setEditing(null)}
          onChange={(b) => setEditing(b)}
          onSave={() => saveBrief(editing)}
          onDelete={() => deleteBrief(editing.id)}
          onGenerate={() => generateCaption(editing)}
        />
      )}
    </AppShell>
  );
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

function StatusDot({ status }: { status: string }) {
  const c =
    status === "published" ? "bg-success" :
    status === "approved" ? "bg-primary" :
    status === "scheduled" ? "bg-accent" :
    status === "failed" ? "bg-destructive" :
    status === "skipped" ? "bg-warning" :
    "bg-muted-foreground/40";
  return <span className={`h-1.5 w-1.5 rounded-full ${c}`} />;
}

function BriefEditor({
  brief, onClose, onChange, onSave, onDelete, onGenerate, generating,
}: {
  brief: Brief;
  generating: boolean;
  onClose: () => void;
  onChange: (b: Brief) => void;
  onSave: () => void;
  onDelete: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <GlassCard strong className="relative w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-t-3xl sm:rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
              {format(new Date(brief.slot_start), "EEEE, MMM d · HH:mm")}
            </p>
            <h2 className="text-lg font-semibold mt-0.5">Edit brief</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-white/10"><XMarkIcon className="h-5 w-5" /></button>
        </div>

        <div className="grid gap-4">
          <div>
            <GlassLabel>Topic</GlassLabel>
            <GlassInput value={brief.topic} onChange={(e) => onChange({ ...brief, topic: e.target.value })} />
          </div>
          <div>
            <GlassLabel hint={`${brief.caption.length} chars`}>Caption</GlassLabel>
            <GlassTextarea value={brief.caption} onChange={(e) => onChange({ ...brief, caption: e.target.value })} rows={5} />
          </div>
          <div>
            <GlassLabel>Hashtags (comma-separated)</GlassLabel>
            <GlassInput
              value={brief.hashtags.join(", ")}
              onChange={(e) => onChange({
                ...brief,
                hashtags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
              })}
              placeholder="coffee, espresso, morning"
            />
          </div>
          <div>
            <GlassLabel>Image prompt</GlassLabel>
            <GlassTextarea value={brief.image_prompt} onChange={(e) => onChange({ ...brief, image_prompt: e.target.value })} rows={3} />
          </div>
          <div>
            <GlassLabel>Image URL</GlassLabel>
            <GlassInput value={brief.image_url ?? ""} onChange={(e) => onChange({ ...brief, image_url: e.target.value || null })} placeholder="https://..." />
          </div>
          <div>
            <GlassLabel>Status</GlassLabel>
            <select
              value={brief.status}
              onChange={(e) => onChange({ ...brief, status: e.target.value })}
              className="glass-input w-full h-11 rounded-xl px-3 text-sm"
            >
              {["draft", "approved", "scheduled", "published", "skipped", "failed"].map((s) =>
                <option key={s} value={s} className="bg-background">{s}</option>
              )}
            </select>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <GlassButton variant="primary" onClick={onSave}><CheckIcon className="h-4 w-4" /> Save</GlassButton>
          <GlassButton variant="subtle" loading={generating} onClick={onGenerate}>
            <SparklesIcon className="h-4 w-4" /> Generate with AI
          </GlassButton>
          <div className="flex-1" />
          <GlassButton variant="ghost" onClick={onDelete}><TrashIcon className="h-4 w-4 text-destructive" /></GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}
