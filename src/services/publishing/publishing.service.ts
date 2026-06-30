import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "../base";
import { BriefRepository } from "../../repositories/brief-repository";
import { PageRepository } from "../../repositories/page-repository";
import type { ScheduleBrief } from "../../hooks/useAuroraQuery";

export interface SaveDraftInput {
  pageId: string;
  slotStart: string;
  topic: string;
  caption: string;
  hashtags: string[];
  imagePrompt: string;
  imageUrl: string | null;
  status: string;
  briefId?: string;
}

export interface CreateBriefInput {
  pageId: string;
  slotStart: string;
  topic?: string;
  caption?: string;
  status?: string;
}

export class PublishingService extends BaseService {
  private readonly _client: SupabaseClient;
  private briefs: BriefRepository;
  private pages: PageRepository;

  constructor(client: SupabaseClient) {
    super("PublishingService");
    this._client = client;
    this.briefs = new BriefRepository(client);
    this.pages = new PageRepository(client);
  }

  async loadPageInfo(): Promise<{ id: string; name: string } | null> {
    const page = await this.pages.findDefault();
    if (!page) return null;
    return { id: page.id, name: page.fb_page_name };
  }

  async loadBrief(briefId: string) {
    const { data, error } = await this._client
      .from("content_briefs")
      .select("id, page_id, slot_start, topic, caption, hashtags, image_prompt, image_url, status")
      .eq("id", briefId)
      .single();
    if (error) this.handleError(new Error(error.message), "loadBrief");
    return data as Record<string, unknown> | null;
  }

  async saveDraft(input: SaveDraftInput): Promise<void> {
    const rowData = {
      page_id: input.pageId,
      slot_start: input.slotStart,
      topic: input.topic,
      caption: input.caption,
      hashtags: input.hashtags,
      image_prompt: input.imagePrompt || "",
      image_url: input.imageUrl,
      status: input.status,
      approved_at: input.status === "approved" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (input.briefId) {
      const { error } = await this._client.from("content_briefs").update(rowData).eq("id", input.briefId);
      if (error) this.handleError(error, "saveDraft.update");
    } else {
      const { error } = await this._client.from("content_briefs").insert(rowData);
      if (error) this.handleError(error, "saveDraft.insert");
    }

    this.log("saveDraft", `Brief ${input.briefId ? "updated" : "created"} with status ${input.status}`, { pageId: input.pageId });
  }

  async createBrief(input: CreateBriefInput): Promise<ScheduleBrief | null> {
    const { data, error } = await this._client
      .from("content_briefs")
      .insert({
        page_id: input.pageId,
        slot_start: input.slotStart,
        topic: input.topic ?? "",
        caption: input.caption ?? "",
        hashtags: [],
        image_prompt: "",
        status: input.status ?? "draft",
      })
      .select("*")
      .single();

    if (error) this.handleError(error, "createBrief");
    return (data ?? null) as ScheduleBrief | null;
  }

  async patchBrief(id: string, patch: Partial<Record<string, unknown>>): Promise<void> {
    const { error } = await this._client
      .from("content_briefs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) this.handleError(error, "patchBrief");
  }

  async deleteBrief(id: string): Promise<void> {
    const { error } = await this._client
      .from("content_briefs")
      .delete()
      .eq("id", id);
    if (error) this.handleError(error, "deleteBrief");
  }

  async uploadImage(
    file: File,
    bucket = "generated-images",
    maxSizeMB = 5,
  ): Promise<string> {
    if (file.size > maxSizeMB * 1024 * 1024) {
      throw new Error(`Image must be under ${maxSizeMB}MB`);
    }
    const ext = file.name.split(".").pop() || "png";
    const path = `${bucket}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await this._client.storage.from(bucket).upload(path, file, {
      contentType: file.type,
      upsert: true,
    });
    if (error) this.handleError(error, "uploadImage");
    const { data } = this._client.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  private handleError(error: unknown, context: string): never {
    const message = error instanceof Error ? error.message : String(error);
    this.logError(context, message);
    throw error instanceof Error ? error : new Error(message);
  }
}
