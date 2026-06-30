import { addDays, addMinutes, startOfDay } from "date-fns";
import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "../base";
import { BriefRepository } from "../../repositories/brief-repository";
import { PageRepository } from "../../repositories/page-repository";

export interface PostingWindow {
  hour: number;
  minute: number;
}

export type ScheduleBrief = {
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

export type PageRef = { id: string; fb_page_name: string };

export class ScheduleService extends BaseService {
  private briefs?: BriefRepository;
  private pages?: PageRepository;

  constructor(client?: SupabaseClient) {
    super("ScheduleService");
    if (client) {
      this.briefs = new BriefRepository(client);
      this.pages = new PageRepository(client);
    }
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

  async findScheduleData(weekDays: Date[], pageId: string): Promise<{ pages: PageRef[]; briefs: ScheduleBrief[] }> {
    if (!this.pages || !this.briefs) return { pages: [], briefs: [] };
    const page = await this.pages.findDefault();
    const pages: PageRef[] = page ? [{ id: page.id, fb_page_name: page.fb_page_name }] : [];

    const pid = pageId || pages[0]?.id;
    if (!pid) return { pages, briefs: [] };

    const weekStart = weekDays[0].toISOString();
    const weekEnd = new Date(weekDays[6]);
    weekEnd.setDate(weekEnd.getDate() + 1);
    const briefs = await this.briefs.findByPageAndRange(pid, weekStart, weekEnd.toISOString());
    return { pages, briefs: briefs as ScheduleBrief[] };
  }

  async findActivePageId(): Promise<string | null> {
    if (!this.pages) return null;
    return this.pages.getActivePageId();
  }
}
