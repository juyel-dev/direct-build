import { isSameDay, format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays } from "date-fns";
import type { ScheduleBrief } from "@/hooks/useAuroraQuery";

const STATUS_COLORS: Record<string, string> = {
  published: "bg-success",
  approved: "bg-primary",
  scheduled: "bg-accent",
  failed: "bg-destructive",
  skipped: "bg-warning",
  draft: "bg-muted-foreground/40",
};

export function MonthView(props: {
  monthOffset: number;
  briefs: ScheduleBrief[];
  onOpen: (b: ScheduleBrief) => void;
  onAdd: (d: Date) => void;
}) {
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth() + props.monthOffset, 1);
  const monthStart = startOfMonth(base);
  const monthEnd = endOfMonth(base);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days: Date[] = [];
  let d = calStart;
  while (d <= calEnd) {
    days.push(d);
    d = addDays(d, 1);
  }

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="glass rounded-2xl p-4">
      <div className="grid grid-cols-7 mb-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
          <div key={name} className="text-center text-[10px] uppercase tracking-wider text-muted-foreground py-1">
            {name}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t border-white/5">
          {week.map((day) => {
            const inMonth = day >= monthStart && day <= monthEnd;
            const isToday = isSameDay(day, today);
            const dayBriefs = props.briefs.filter((b) => isSameDay(new Date(b.slot_start), day));
            return (
              <button
                key={day.toISOString()}
                onClick={() => dayBriefs.length > 0 ? props.onOpen(dayBriefs[0]) : props.onAdd(day)}
                className={
                  "min-h-[72px] p-1.5 text-left border-r border-white/5 last:border-r-0 transition-colors " +
                  (inMonth ? "hover:bg-white/5" : "opacity-30 pointer-events-none ") +
                  (isToday ? "bg-accent/10" : "")
                }
              >
                <span className={"text-xs font-medium " + (isToday ? "text-accent" : inMonth ? "text-foreground" : "text-muted-foreground")}>
                  {format(day, "d")}
                </span>
                {dayBriefs.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {dayBriefs.slice(0, 4).map((b) => (
                      <span key={b.id} className={"h-1.5 w-1.5 rounded-full " + (STATUS_COLORS[b.status] ?? "bg-muted-foreground/40")} />
                    ))}
                    {dayBriefs.length > 4 && (
                      <span className="text-[9px] text-muted-foreground">+{dayBriefs.length - 4}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
