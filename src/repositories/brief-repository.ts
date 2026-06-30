import { BaseRepository } from "./base";
import type { Brief } from "../types";

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

  async findBriefTopics(): Promise<{ id: string; topic: string }[]> {
    const { data, error } = await this.client
      .from("content_briefs")
      .select("id, topic");
    if (error) this.handleError(error, "briefs.findBriefTopics");
    return (data ?? []) as { id: string; topic: string }[];
  }

  async findById(id: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client
      .from("content_briefs")
      .select("id, page_id, slot_start, topic, caption, hashtags, image_prompt, image_url, status")
      .eq("id", id)
      .single();
    if (error) {
      if (error.code === "PGRST116") return null;
      this.handleError(error, "briefs.findById");
    }
    return data as Record<string, unknown> | null;
  }

  async upsert(row: Record<string, unknown>): Promise<void> {
    const { error } = await this.client.from("content_briefs").upsert(row);
    if (error) this.handleError(error, "briefs.upsert");
  }

  async insert(row: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const { data, error } = await this.client
      .from("content_briefs")
      .insert(row)
      .select("*")
      .single();
    if (error) this.handleError(error, "briefs.insert");
    return data as Record<string, unknown> | null;
  }

  async patch(id: string, updates: Record<string, unknown>): Promise<void> {
    const { error } = await this.client
      .from("content_briefs")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.handleError(error, "briefs.patch");
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from("content_briefs")
      .delete()
      .eq("id", id);
    if (error) this.handleError(error, "briefs.delete");
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
