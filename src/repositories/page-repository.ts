import { BaseRepository } from "./base";
import type { Page } from "../types";

export class PageRepository extends BaseRepository {
  async findActive(): Promise<Page[]> {
    const { data, error } = await this.client
      .from("pages")
      .select("*")
      .eq("status", "active");
    if (error) this.handleError(error, "pages.findActive");
    return (data ?? []) as Page[];
  }

  async findById(id: string): Promise<Page | null> {
    const { data, error } = await this.client
      .from("pages")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) this.handleError(error, "pages.findById");
    return (data ?? null) as Page | null;
  }

  async findDefault(): Promise<Page | null> {
    const { data, error } = await this.client
      .from("pages")
      .select("id, fb_page_name")
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (error) this.handleError(error, "pages.findDefault");
    return (data ?? null) as Page | null;
  }

  async getActivePageId(): Promise<string | null> {
    const page = await this.findDefault();
    return page?.id ?? null;
  }
}
