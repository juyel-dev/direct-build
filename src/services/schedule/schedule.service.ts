import { addDays, addMinutes, isSameDay, startOfDay } from "date-fns";
import { BaseService } from "../base";

export interface PostingWindow {
  hour: number;
  minute: number;
}

export class ScheduleService extends BaseService {
  constructor() {
    super("ScheduleService");
  }

  generateWeekDays(weekOffset: number): Date[] {
    const start = addDays(startOfDay(new Date()), weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }

  nextSuggestedSlot(
    forDay: Date,
    usedSlots: Date[],
    postingWindows: PostingWindow[],
  ): Date {
    const used = usedSlots.map((d) => d.getTime());
    const windows = postingWindows.length ? postingWindows : [{ hour: 9, minute: 0 }];

    for (const w of windows) {
      const t = new Date(forDay);
      t.setHours(w.hour, w.minute, 0, 0);
      if (!used.includes(t.getTime())) return t;
    }

    const last = used.length
      ? new Date(Math.max(...used))
      : new Date(forDay).setHours(9, 0, 0, 0);
    return addMinutes(new Date(last), 120);
  }
}
