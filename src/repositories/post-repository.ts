import { BaseRepository, type QueryOptions, type PaginatedResult } from "./base";
import type { Post } from "../types";

export class PostRepository extends BaseRepository {
  async countRecent(pageId: string, since: string): Promise<number> {
    const { count, error } = await this.client
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("page_id", pageId)
      .eq("status", "published")
      .gte("published_at", since);
    if (error) this.handleError(error, "posts.countRecent");
    return count ?? 0;
  }

  async countPublishedToday(pageId: string): Promise<number> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return this.countRecent(pageId, today.toISOString());
  }

  async countPublishedLast7d(): Promise<number> {
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { count, error } = await this.client
      .from("posts")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since);
    if (error) this.handleError(error, "posts.countPublishedLast7d");
    return count ?? 0;
  }

  async findPublishedWithMetrics(since: string): Promise<any[]> {
    const { data, error } = await this.client
      .from("posts")
      .select("id, published_at, fb_permalink_url, content_brief_id")
      .gte("published_at", since)
      .order("published_at", { ascending: false });
    if (error) this.handleError(error, "posts.findPublishedWithMetrics");
    return data ?? [];
  }

  async findByPage(pageId: string, options?: QueryOptions): Promise<PaginatedResult<Post>> {
    const buildQuery = () => this.client
      .from("posts")
      .select("*")
      .eq("page_id", pageId);
    return this.withPagination<Post>(buildQuery, options);
  }
}
