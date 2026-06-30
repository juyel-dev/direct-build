import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "../base";
import { BriefRepository } from "../../repositories/brief-repository";
import { PageRepository } from "../../repositories/page-repository";
import type { Brief } from "../../types";

export class DraftService extends BaseService {
  private briefs: BriefRepository;
  private pages: PageRepository;

  constructor(client: SupabaseClient) {
    super("DraftService");
    this.briefs = new BriefRepository(client);
    this.pages = new PageRepository(client);
  }

  async findDrafts(): Promise<{ drafts: Brief[]; pageName: string }> {
    const [drafts, page] = await Promise.all([
      this.briefs.findDrafts(),
      this.pages.findDefault(),
    ]);
    return { drafts: drafts as Brief[], pageName: page?.fb_page_name ?? "" };
  }

  async approve(draftId: string): Promise<void> {
    await this.briefs.approve(draftId);
    this.log("approve", `Approved draft ${draftId}`);
  }

  async reject(draftId: string): Promise<void> {
    await this.briefs.reject(draftId);
    this.log("reject", `Rejected draft ${draftId}`);
  }

  async bulkApprove(draftIds: string[]): Promise<void> {
    await this.briefs.bulkApprove(draftIds);
    this.log("bulkApprove", `Approved ${draftIds.length} drafts`);
  }

  async bulkReject(draftIds: string[]): Promise<void> {
    await this.briefs.bulkReject(draftIds);
    this.log("bulkReject", `Rejected ${draftIds.length} drafts`);
  }

  async countDrafts(): Promise<number> {
    return this.briefs.countDrafts();
  }
}
