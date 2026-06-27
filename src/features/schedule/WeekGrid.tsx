import { isSameDay, format } from "date-fns";
import {
  PlusIcon,
  ClockIcon,
  PencilSquareIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import type { ScheduleBrief } from "@/hooks/useAuroraQuery";

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

export function WeekGrid({
  days, briefs, onAdd, onOpen, onPreview, onDragStart, onDrop, onQuickTime,
}: {
  days: Date[];
  briefs: ScheduleBrief[];
  onAdd: (d: Date) => void;
  onOpen: (b: ScheduleBrief) => void;
  onPreview: (b: ScheduleBrief) => void;
  onDragStart: (e: React.DragEvent, b: ScheduleBrief) => void;
  onDrop: (e: React.DragEvent, d: Date) => void;
  onQuickTime: (b: ScheduleBrief, deltaMinutes: number) => void;
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
                aria-label={`Add post on ${format(d, "EEEE, MMM d")}`}
              ><PlusIcon className="h-3.5 w-3.5" /></button>
            </div>

            <div className="space-y-1.5 flex-1">
              {dayBriefs.length === 0 && (
                <button
                  onClick={() => onAdd(d)}
                  className="w-full h-full min-h-[60px] text-[11px] text-muted-foreground/60 rounded-lg border border-dashed border-white/10 hover:border-primary/40 hover:text-foreground transition"
                  aria-label={`Add post on ${format(d, "EEEE, MMM d")}`}
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
                      aria-label="Move 15 minutes earlier"
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
                      aria-label="Move 15 minutes later"
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
