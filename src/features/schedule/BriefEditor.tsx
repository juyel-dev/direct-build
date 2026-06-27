import { GlassInput, GlassLabel, GlassTextarea } from "@/components/glass/GlassInput";
import { FacebookPreview } from "@/components/facebook/FacebookPreview";
import { addDays, addMinutes, format } from "date-fns";
import type { ScheduleBrief } from "@/hooks/useAuroraQuery";

const STATUSES = ["draft", "approved", "scheduled", "published", "skipped", "failed"] as const;

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

export function BriefEditor({
  brief, onChange, pageName, postingWindows,
}: {
  brief: ScheduleBrief;
  onChange: (b: ScheduleBrief) => void;
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
              aria-label="Schedule date and time"
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
                aria-label={`Set status to ${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

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
