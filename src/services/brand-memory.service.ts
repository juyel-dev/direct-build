import { SupabaseClient } from "@supabase/supabase-js";
import { BaseService } from "./base";
import { BrandMemoryRepository } from "../repositories/brand-memory-repository";
import { PostRepository } from "../repositories/post-repository";
import type { BrandMemory } from "../types";

export class BrandMemoryService extends BaseService {
  private repo: BrandMemoryRepository;
  private posts: PostRepository;

  constructor(client: SupabaseClient) {
    super("BrandMemoryService");
    this.repo = new BrandMemoryRepository(client);
    this.posts = new PostRepository(client);
  }

  async load(pageId: string): Promise<BrandMemory | null> {
    return this.repo.findByPageId(pageId);
  }

  async save(pageId: string, memory: Partial<BrandMemory>): Promise<BrandMemory> {
    const existing = await this.repo.findByPageId(pageId);
    if (existing) {
      return this.repo.update(pageId, { ...memory, manually_edited_at: new Date().toISOString() });
    }
    return this.repo.upsert({ page_id: pageId, ...memory, manually_edited_at: new Date().toISOString() });
  }

  buildLlmContext(memory: BrandMemory | null): string {
    if (!memory) return "";

    const parts: string[] = [];
    if (memory.brand_descriptors.length) {
      parts.push(`Brand identity: ${memory.brand_descriptors.join(", ")}.`);
    }
    if (memory.writing_style_notes) {
      parts.push(`Writing style: ${memory.writing_style_notes}.`);
    }
    if (memory.tone_guidelines) {
      parts.push(`Tone: ${memory.tone_guidelines}.`);
    }
    if (memory.effective_hashtags.length) {
      parts.push(`Effective hashtags: ${memory.effective_hashtags.join(", ")}.`);
    }
    if (memory.audience_profile && Object.keys(memory.audience_profile).length) {
      parts.push(`Audience: ${JSON.stringify(memory.audience_profile)}.`);
    }
    if (memory.avoided_topics.length) {
      parts.push(`Avoid topics: ${memory.avoided_topics.join(", ")}.`);
    }
    return parts.join(" ");
  }

  async autoExtract(pageId: string): Promise<Partial<BrandMemory>> {
    const posts = await this.posts.findPublishedWithBriefs(
      pageId,
      new Date(Date.now() - 90 * 86400_000).toISOString(),
    ) as Array<{
      content_briefs?: { topic?: string; caption?: string; hashtags?: string[] };
      engagement_snapshots?: Array<{ likes: number; comments: number; shares: number }>;
    }>;

    if (!posts.length) return {};

    const hashtagCount = new Map<string, number>();
    const tones = new Set<string>();
    const snippets: Array<{ topic: string; caption: string; score: number }> = [];

    for (const post of posts) {
      const brief = post.content_briefs;
      if (!brief) continue;

      if (Array.isArray(brief.hashtags)) {
        for (const tag of brief.hashtags) {
          hashtagCount.set(tag, (hashtagCount.get(tag) ?? 0) + 1);
        }
      }

      const snaps = (post.engagement_snapshots ?? []) as Array<{
        likes: number;
        comments: number;
        shares: number;
      }>;
      const latest = snaps[snaps.length - 1];
      const score = latest
        ? latest.likes + latest.comments * 2 + latest.shares * 3
        : 0;

      if (brief.caption && score > 0) {
        snippets.push({ topic: brief.topic ?? "", caption: brief.caption, score });
        if (brief.caption.length < 100) tones.add("concise");
        else if (brief.caption.length < 200) tones.add("moderate");
        else tones.add("detailed");
      }
    }

    snippets.sort((a, b) => b.score - a.score);

    const effectiveHashtags = Array.from(hashtagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    return {
      brand_descriptors: [],
      writing_style_notes: Array.from(tones).length
        ? `Posts tend to be ${Array.from(tones).join(", ")} in length.`
        : "",
      effective_hashtags: effectiveHashtags,
      top_content_snippets: snippets.slice(0, 5).map((s) => ({
        topic: s.topic,
        caption: s.caption.slice(0, 200),
        score: s.score,
      })),
      auto_extracted_at: new Date().toISOString(),
    };
  }
}
