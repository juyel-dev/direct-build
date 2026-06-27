import { isSameDay, format } from "date-fns";
import { PlusIcon, EyeIcon } from "@heroicons/react/24/outline";
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

export function TimelineList({
  days, briefs, onOpen, onPreview, onAdd,
}: {
  days: Date[];
  briefs: ScheduleBrief[];
  onOpen: (b: ScheduleBrief) => void;
  onPreview: (b: ScheduleBrief) => void;
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
