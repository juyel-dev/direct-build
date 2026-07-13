/**
 * Facebook-specific publishing/metrics logic, isolated behind the
 * PlatformAdapter interface so a future second platform (Instagram,
 * LinkedIn, etc.) can implement the same contract without touching
 * shared orchestration code (queue, publishing pipeline).
 */
import { fetchWithTimeout, log, type Page, type Brief, GRAPH_VERSION } from "./_core.ts";
import { isFacebookTokenErrorCode } from "./_shared.ts";

export interface PlatformAdapter {
  validateToken(token: string): Promise<{ valid: boolean; error?: string }>;
  publishPost(
    page: Page,
    brief: Brief,
    token: string,
    caption: string,
  ): Promise<{ fbPostId: string | null; permalink: string | null }>;
  fetchMetrics(
    fbPostId: string,
    token: string,
  ): Promise<{
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
  }>;
}

export class FacebookTokenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "FacebookTokenError";
  }
}

export class PublishError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "PublishError";
  }
}

export class FacebookAdapter implements PlatformAdapter {
  private baseUrl = `https://graph.facebook.com/${GRAPH_VERSION}`;

  async validateToken(token: string): Promise<{ valid: boolean; error?: string }> {
    const url = `${this.baseUrl}/me?fields=id`;
    const response = await fetchWithTimeout(url, {
      timeout: 10_000,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      const code = body.error?.code ?? body.error?.error_code;
      const msg = body.error?.message ?? `HTTP ${response.status}`;
      if (code === 190 || code === 102 || response.status === 401) {
        return { valid: false, error: `Token expired or invalid: ${msg.slice(0, 120)}` };
      }
      return { valid: false, error: msg.slice(0, 120) };
    }
    return { valid: true };
  }

  async publishPost(
    page: Page,
    brief: Brief,
    token: string,
    caption: string,
  ): Promise<{ fbPostId: string | null; permalink: string | null }> {
    const endpoint = brief.image_url
      ? `${this.baseUrl}/${encodeURIComponent(page.fb_page_id ?? "")}/photos`
      : `${this.baseUrl}/${encodeURIComponent(page.fb_page_id ?? "")}/feed`;
    const body = new URLSearchParams();
    body.set("access_token", token);
    if (brief.image_url) {
      body.set("url", brief.image_url);
      body.set("caption", caption);
      body.set("published", "true");
    } else {
      body.set("message", caption);
    }
    const response = await fetchWithTimeout(endpoint, { method: "POST", body, timeout: 15_000 });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.error) {
      const errorCode = result.error?.code ?? result.error?.error_code;
      const errorText = result.error?.message ?? JSON.stringify(result).slice(0, 200);
      if (isFacebookTokenErrorCode(errorCode)) {
        throw new FacebookTokenError(errorText);
      }
      throw new PublishError(errorText);
    }
    const fbPostId = result.post_id ?? result.id;
    const permalink = fbPostId ? `https://www.facebook.com/${fbPostId}` : null;
    return { fbPostId, permalink };
  }

  async fetchMetrics(
    fbPostId: string,
    token: string,
  ): Promise<{
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
  }> {
    // See fetchFacebookMetrics() in index.ts for why insights.metric(...)
    // with post_media_view/post_total_media_view_unique is used instead of
    // the deprecated bare reach/impressions fields.
    const fields =
      "likes.summary(true),comments.summary(true),shares,insights.metric(post_media_view,post_total_media_view_unique)";
    const url = `${this.baseUrl}/${encodeURIComponent(fbPostId)}?fields=${encodeURIComponent(fields)}`;
    const response = await fetchWithTimeout(url, {
      timeout: 10_000,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) {
      log("warn", "facebook_metrics_fetch_failed", {
        fbPostId,
        error: body.error?.message ?? `HTTP ${response.status}`,
      });
      return { likes: 0, comments: 0, shares: 0, reach: 0, impressions: 0 };
    }
    const insightValues = new Map<string, number>();
    if (body.insights && typeof body.insights === "object" && Array.isArray(body.insights.data)) {
      for (const item of body.insights.data) {
        if (item && typeof item.name === "string") {
          insightValues.set(item.name, Number(item.values?.[0]?.value ?? 0));
        }
      }
    }
    return {
      likes: body.likes?.summary?.total_count ?? body.likes?.data?.length ?? 0,
      comments: body.comments?.summary?.total_count ?? body.comments?.data?.length ?? 0,
      shares: body.shares?.count ?? 0,
      reach: insightValues.get("post_total_media_view_unique") ?? 0,
      impressions: insightValues.get("post_media_view") ?? 0,
    };
  }
}
