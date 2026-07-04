import { useState, useRef } from "react";
import { GlassPanel } from "@/components/glass/GlassCard";
import { GlassInput, GlassLabel, GlassTextarea } from "@/components/glass/GlassInput";
import { GlassButton } from "@/components/glass/GlassButton";
import { loadBrand, saveBrand, type Brand } from "@/lib/config-store";
import { createUserClient } from "@/services/supabase-factory";
import { toast } from "sonner";
import { CheckCircleIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

export function BrandTab() {
  const [brand, setBrand] = useState<Brand>(loadBrand());
  const [topicDraft, setTopicDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const prevInterval = useRef(brand.workerIntervalMinutes);

  async function handleSave() {
    saveBrand(brand);
    setSavedAt(Date.now());
    if (brand.workerIntervalMinutes !== prevInterval.current) {
      prevInterval.current = brand.workerIntervalMinutes;
      try {
        const sb = await createUserClient();
        if (sb) {
          await sb.rpc("update_worker_cron_interval", { p_interval_minutes: brand.workerIntervalMinutes });
          toast.success(`Worker rescheduled to every ${brand.workerIntervalMinutes} min`);
        }
      } catch {
        toast.info("Re-run Setup to apply the new interval.");
      }
    }
  }

  function addTopic() {
    const t = topicDraft.trim();
    if (!t) return;
    setBrand((b) => ({ ...b, topics: [...new Set([...b.topics, t])] }));
    setTopicDraft("");
  }

  function removeTopic(t: string) {
    setBrand((b) => ({ ...b, topics: b.topics.filter((x) => x !== t) }));
  }

  function updateWindow(i: number, field: "hour" | "minute", v: number) {
    setBrand((b) => ({
      ...b,
      postingWindows: b.postingWindows.map((w, idx) => (idx === i ? { ...w, [field]: v } : w)),
    }));
  }

  return (
    <div className="flex flex-col gap-5">
      <GlassPanel title="Brand voice" description="The planner steers every post toward this voice.">
        <div className="grid gap-4">
          <div>
            <GlassLabel>Brand name</GlassLabel>
            <GlassInput
              value={brand.brandName}
              onChange={(e) => setBrand((b) => ({ ...b, brandName: e.target.value }))}
              placeholder="Aurora Coffee Co."
            />
          </div>
          <div>
            <GlassLabel>Voice & tone</GlassLabel>
            <GlassTextarea
              value={brand.voice}
              onChange={(e) => setBrand((b) => ({ ...b, voice: e.target.value }))}
              placeholder="Warm, knowledgeable, never salesy. Short sentences. Occasional dry humor."
            />
          </div>
          <div>
            <GlassLabel>Target audience</GlassLabel>
            <GlassTextarea
              value={brand.audience}
              onChange={(e) => setBrand((b) => ({ ...b, audience: e.target.value }))}
              placeholder="Specialty-coffee enthusiasts, 25-45, urban, design-conscious."
            />
          </div>
          <div>
            <GlassLabel>Topics</GlassLabel>
            <div className="flex gap-2">
              <GlassInput
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTopic())}
                placeholder="Add a topic and hit Enter"
              />
              <GlassButton variant="subtle" onClick={addTopic}><PlusIcon className="h-4 w-4" /></GlassButton>
            </div>
            {brand.topics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {brand.topics.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/12 px-2.5 py-1 text-xs">
                    {t}
                    <button onClick={() => removeTopic(t)} className="text-muted-foreground hover:text-foreground">
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel
        title="Posting windows"
        description="3 daily time slots the planner will fill. The publisher schedules within ±15 min."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {brand.postingWindows.map((w, i) => (
            <div key={i} className="glass rounded-xl p-3">
              <GlassLabel>Slot {i + 1}</GlassLabel>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={w.hour}
                  onChange={(e) => updateWindow(i, "hour", Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                  className="glass-input w-16 h-10 rounded-lg px-2 text-sm text-center"
                />
                <span className="text-muted-foreground">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={w.minute}
                  onChange={(e) => updateWindow(i, "minute", Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                  className="glass-input w-16 h-10 rounded-lg px-2 text-sm text-center"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <GlassLabel>Posting mode</GlassLabel>
            <select
              value={brand.postingMode}
              onChange={(e) => setBrand((b) => ({ ...b, postingMode: e.target.value as Brand["postingMode"] }))}
              className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
            >
              <option value="manual" className="bg-background">Manual — approve every post</option>
              <option value="hybrid" className="bg-background">Hybrid — approve once, queue runs</option>
              <option value="full_auto" className="bg-background">Full Auto — publishes without review</option>
            </select>
          </div>
          <div>
            <GlassLabel>Max posts / day</GlassLabel>
            <GlassInput
              type="number"
              min={1}
              max={10}
              value={brand.maxPostsPerDay}
              onChange={(e) => setBrand((b) => ({ ...b, maxPostsPerDay: Math.max(1, Math.min(10, Number(e.target.value) || 1)) }))}
            />
          </div>
          <div>
            <GlassLabel>Worker interval</GlassLabel>
            <select
              value={brand.workerIntervalMinutes}
              onChange={(e) => {
                const mins = Number(e.target.value);
                setBrand((b) => ({ ...b, workerIntervalMinutes: mins }));
              }}
              className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
            >
              <option value={1} className="bg-background">Every 1 minute</option>
              <option value={5} className="bg-background">Every 5 minutes</option>
              <option value={10} className="bg-background">Every 10 minutes</option>
              <option value={15} className="bg-background">Every 15 minutes</option>
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">Requires re-setup to take effect. Higher intervals reduce AI costs.</p>
          </div>
        </div>
      </GlassPanel>

      <div className="flex items-center gap-3">
        <GlassButton variant="primary" size="lg" onClick={handleSave}>Save brand</GlassButton>
        {savedAt && (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <CheckCircleIcon className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </div>
  );
}
