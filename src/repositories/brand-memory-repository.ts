import { BaseRepository } from "./base";
import type { BrandMemory } from "../types";

export class BrandMemoryRepository extends BaseRepository {
  async findByPageId(pageId: string): Promise<BrandMemory | null> {
    const { data, error } = await this.client
      .from("brand_memory")
      .select("*")
      .eq("page_id", pageId)
      .maybeSingle();
    if (error) this.handleError(error, "brand_memory.findByPageId");
    return data as BrandMemory | null;
  }

  async upsert(memory: Partial<BrandMemory> & { page_id: string }): Promise<BrandMemory> {
    const { data, error } = await this.client
      .from("brand_memory")
      .upsert(memory, { onConflict: "page_id" })
      .select("*")
      .maybeSingle();
    if (error) this.handleError(error, "brand_memory.upsert");
    return data as BrandMemory;
  }

  async update(pageId: string, updates: Partial<BrandMemory>): Promise<BrandMemory> {
    const { data, error } = await this.client
      .from("brand_memory")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("page_id", pageId)
      .select("*")
      .maybeSingle();
    if (error) this.handleError(error, "brand_memory.update");
    return data as BrandMemory;
  }
}
