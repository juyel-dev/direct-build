import { useEffect, useRef, useState } from "react";
import { type Brand } from "@/lib/config-store";
import { GlassInput, GlassTextarea } from "@/components/glass/GlassInput";
import { GlassButton } from "@/components/glass/GlassButton";
import { BottomSheet } from "@/components/glass/BottomSheet";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Field, SaveBar } from "./shared";
import { createUserClient } from "@/services/supabase-factory";
import { toast } from "sonner";

export function BrandSheet({
  open,
  onClose,
  brand,
  save,
}: {
  open: boolean;
  onClose: () => void;
  brand: Brand;
  save: (b: Brand) => void;
}) {
  const [draft, setDraft] = useState(brand);
  const [topicDraft, setTopicDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const prevInterval = useRef(brand.workerIntervalMinutes);

  useEffect(() => {
    if (open) {
      setDraft(brand);
      setSaved(false);
      prevInterval.current = brand.workerIntervalMinutes;
    }
  }, [open, brand]);

  function addTopic() {
    const t = topicDraft.trim();
    if (!t) return;
    setDraft({ ...draft, topics: [...new Set([...draft.topics, t])] });
    setTopicDraft("");
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="Brand voice & schedule"
      footer={
        <SaveBar
          onSave={async () => {
            save(draft);
            setSaved(true);
            setTimeout(() => setSaved(false), 1400);
            if (draft.workerIntervalMinutes !== prevInterval.current) {
              const newInterval = draft.workerIntervalMinutes;
              prevInterval.current = newInterval;
              try {
                const sb = await createUserClient();
                if (sb) {
                  await sb.rpc("update_worker_cron_interval", { p_interval_minutes: newInterval });
                  toast.success(`Worker rescheduled to every ${newInterval} min`);
                }
              } catch {
                toast.info("Re-run Setup to apply the new interval.");
              }
            }
          }}
          onClose={onClose}
          saved={saved}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Brand name">
          <GlassInput
            value={draft.brandName}
            onChange={(e) => setDraft({ ...draft, brandName: e.target.value })}
            placeholder="Aurora Coffee Co."
          />
        </Field>
        <Field label="Voice & tone">
          <GlassTextarea
            value={draft.voice}
            onChange={(e) => setDraft({ ...draft, voice: e.target.value })}
            placeholder="Warm, knowledgeable, never salesy."
          />
        </Field>
        <Field label="Audience">
          <GlassTextarea
            value={draft.audience}
            onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
            placeholder="Specialty-coffee enthusiasts, 25-45."
          />
        </Field>
        <Field label="Topics">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <GlassInput
                value={topicDraft}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTopic())}
                placeholder="Add a topic"
              />
            </div>
            <GlassButton variant="subtle" onClick={addTopic}>
              <PlusIcon className="h-4 w-4" />
            </GlassButton>
          </div>
          {draft.topics.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {draft.topics.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/15 px-2.5 py-1 text-xs"
                >
                  {t}
                  <button
                    onClick={() =>
                      setDraft({ ...draft, topics: draft.topics.filter((x) => x !== t) })
                    }
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Field>
        <Field label="Posting mode">
          <select
            value={draft.postingMode}
            onChange={(e) =>
              setDraft({ ...draft, postingMode: e.target.value as Brand["postingMode"] })
            }
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            <option value="manual" className="bg-background">
              Manual — approve every post
            </option>
            <option value="hybrid" className="bg-background">
              Hybrid
            </option>
            <option value="full_auto" className="bg-background">
              Full auto
            </option>
          </select>
        </Field>
        <Field label="Max posts / day">
          <GlassInput
            type="number"
            min={1}
            max={10}
            value={draft.maxPostsPerDay}
            onChange={(e) =>
              setDraft({
                ...draft,
                maxPostsPerDay: Math.max(1, Math.min(10, Number(e.target.value) || 1)),
              })
            }
          />
        </Field>
        <Field label="Worker interval">
          <select
            value={draft.workerIntervalMinutes}
            onChange={(e) => setDraft({ ...draft, workerIntervalMinutes: Number(e.target.value) })}
            className="glass-input w-full h-11 rounded-xl px-3 text-sm focus:outline-none focus:glass-input-focus"
          >
            <option value={1} className="bg-background">
              Every 1 minute
            </option>
            <option value={5} className="bg-background">
              Every 5 minutes
            </option>
            <option value={10} className="bg-background">
              Every 10 minutes
            </option>
            <option value={15} className="bg-background">
              Every 15 minutes
            </option>
          </select>
          <p className="text-[10px] text-muted-foreground mt-1">
            Higher intervals reduce AI/compute costs. Applies immediately on save.
          </p>
        </Field>
      </div>
    </BottomSheet>
  );
}
