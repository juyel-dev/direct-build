import { BaseRepository } from "./base";
import type { Brief, BriefStatus } from "../types";

export class BriefRepository extends BaseRepository {
  async findNext(pageId: string, limit = 5): Promise<Brief[]> {
    const { data, error } = await this.client
      .from("content_briefs")
      .select("id, slot_start, topic, caption, status, image_url")
      .eq("page_id", pageId)
      .order("slot_start")
      .limit(limit);
    if (error) this.handleError(error, "briefs.findNext");
    return (data ?? []) as Brief[];
  }

  async findDrafts(): Promise<Brief[]> {
    const { data, error } = await this.client
      .from("content_briefs")
      .select(
        "id, page_id, slot_start, topic, caption, hashtags, image_prompt, image_url, status, created_at",
      )
      .eq("status", "draft")
      .order("slot_start", { ascending: true });
    if (error) this.handleError(error, "briefs.findDrafts");
    return (data ?? []) as Brief[];
  }

  async findByPageAndRange(
    pageId: string,
    from: string,
    to: string,
  ): Promise<Brief[]> {
    const { data, error } = await this.client
      .from("content_briefs")
      .select("*")
      .eq("page_id", pageId)
      .gte("slot_start", from)
      .lt("slot_start", to)
      .order("slot_start");
    if (error) this.handleError(error, "briefs.findByPageAndRange");
    return (data ?? []) as Brief[];
  }

  async approve(id: string): Promise<void> {
    const { error } = await this.client
      .from("content_briefs")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) this.handleError(error, "briefs.approve");
  }

  async reject(id: string): Promise<void> {
    const { error } = await this.client
      .from("content_briefs")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.handleError(error, "briefs.reject");
  }

  async bulkApprove(ids: string[]): Promise<void> {
    const { error } = await this.client
      .from("content_briefs")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) this.handleError(error, "briefs.bulkApprove");
  }

  async bulkReject(ids: string[]): Promise<void> {
    const { error } = await this.client
      .from("content_briefs")
      .update({ status: "skipped", updated_at: new Date().toISOString() })
      .in("id", ids);
    if (error) this.handleError(error, "briefs.bulkReject");
  }

  async countDrafts(): Promise<number> {
    const { count, error } = await this.client
      .from("content_briefs")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft");
    if (error) this.handleError(error, "briefs.countDrafts");
    return count ?? 0;
  }
}
