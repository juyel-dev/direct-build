/**
 * Engagement snapshot capture, daily analytics aggregation, and
 * scheduled cleanup of old snapshots/expired stored images.
 */
import {
  type Page,
  supabase,
  log,
  messageOf,
  fetchWithTimeout,
  GRAPH_VERSION,
  PAGE_TOKEN,
  IMAGE_STORAGE_BUCKET,
} from "./_core.ts";
import { isProviderAvailable, recordProviderFailure } from "./_lifecycle.ts";

export async function cleanupImages(page: Page) {
  const cutoff = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data: expired, error } = await supabase
    .from("content_briefs")
    .select("id, storage_image_path")
    .eq("page_id", page.id)
    .eq("storage_image_pinned", false)
    .not("storage_image_path", "is", null)
    .not("image_stored_at", "is", null)
    .lt("image_stored_at", cutoff);
  if (error) {
    log("warn", "Failed to query expired images", { page_id: page.id, error: messageOf(error) });
    return "Error querying expired images.";
  }
  if (!expired || expired.length === 0) return "No expired images to clean up.";
  let deleted = 0;
  const paths = expired.map((b: { storage_image_path: string }) => b.storage_image_path);
  for (const path of paths) {
    const { error: removeError } = await supabase.storage.from(IMAGE_STORAGE_BUCKET).remove([path]);
    if (removeError) {
      log("warn", "Failed to remove image from storage", { path, error: messageOf(removeError) });
    }
    deleted++;
  }
  const ids = expired.map((b: { id: string }) => b.id);
  await supabase
    .from("content_briefs")
    .update({
      storage_image_path: null,
      image_stored_at: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  return `Cleaned up ${deleted} expired images.`;
}

export async function captureEngagement(page: Page, windowDays: number) {
  if (!PAGE_TOKEN) return "Skipped — Facebook page token missing.";
  if (!(await isProviderAvailable("facebook"))) return "Skipped — Facebook API in cooldown.";

  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("posts")
    .select("id, fb_post_id")
    .eq("page_id", page.id)
    .eq("status", "published")
    .gte("published_at", since)
    .not("fb_post_id", "is", null);
  if (error) throw error;

  let captured = 0;
  for (const post of (data ?? []) as { id: string; fb_post_id: string }[]) {
    const metrics = await fetchFacebookMetrics(post.fb_post_id, PAGE_TOKEN);
    if (!metrics) continue;
    await supabase.from("engagement_snapshots").insert({
      post_id: post.id,
      likes: metrics.likes,
      comments: metrics.comments,
      shares: metrics.shares,
      reactions: metrics.reactions,
      reach: metrics.reach,
      impressions: metrics.impressions,
    });
    captured += 1;
  }
  return `Captured ${captured} engagement snapshots.`;
}

export async function fetchFacebookMetrics(fbPostId: string, token: string) {
  if (!(await isProviderAvailable("facebook"))) return null;
  // Meta deprecated post_impressions (replaced by post_media_view, effective
  // Nov 15 2025) and post_impressions_unique (replaced by
  // post_total_media_view_unique, effective Jun 15 2026 -- a very recent
  // change as of this fix). Both were previously requested in this single
  // combined insights call; since Meta's Insights API returns a single hard
  // error for the whole request if any requested metric is invalid, using
  // either deprecated name here would fail metrics capture entirely, not
  // just return a stale/zero value for that one field.
  const fields =
    "shares,comments.summary(true),reactions.summary(true),insights.metric(post_media_view,post_total_media_view_unique)";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(fbPostId)}?fields=${encodeURIComponent(fields)}`;
  const response = await fetchWithTimeout(url, {
    timeout: 15_000,
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const errMsg = body.error?.message ?? `Graph API ${response.status}`;
    // Record under a separate circuit key from "facebook" (used for
    // publishing) so a metrics-fetch failure -- e.g. a future metric-name
    // deprecation like this one -- can no longer trip the circuit breaker
    // that gates actual post publishing.
    await recordProviderFailure("facebook_metrics", errMsg);
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(
      `Facebook Graph API returned unexpected response shape: ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  const likes = Number(body.reactions?.summary?.total_count);
  const comments = Number(body.comments?.summary?.total_count);
  const shares = Number(body.shares?.count);
  if (!Number.isFinite(likes) || !Number.isFinite(comments) || !Number.isFinite(shares)) {
    throw new Error(
      `Facebook Graph API response missing expected metrics fields: likes=${JSON.stringify(body.reactions?.summary?.total_count)}, comments=${JSON.stringify(body.comments?.summary?.total_count)}, shares=${JSON.stringify(body.shares?.count)}`,
    );
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
    likes,
    comments,
    shares,
    reactions: body.reactions?.summary ?? {},
    reach: insightValues.get("post_total_media_view_unique") ?? 0,
    impressions: insightValues.get("post_media_view") ?? 0,
  };
}

export async function aggregateDailyAnalytics(page: Page) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().slice(0, 10);
  const dayStart = `${dateStr}T00:00:00Z`;
  const dayEnd = `${dateStr}T23:59:59Z`;

  const { data, error } = await supabase
    .from("engagement_snapshots")
    .select("likes, comments, shares, reach, impressions")
    .gte("captured_at", dayStart)
    .lte("captured_at", dayEnd);
  if (error) {
    log("warn", "Failed to query snapshots for daily aggregation", {
      page_id: page.id,
      error: messageOf(error),
    });
    return "Error aggregating daily analytics.";
  }
  if (!data || data.length === 0) return `No snapshots for ${dateStr}.`;

  let totalLikes = 0,
    totalComments = 0,
    totalShares = 0,
    totalReach = 0,
    totalImpressions = 0;
  const seen = new Set<string>();
  for (const s of data as Array<{
    likes: number;
    comments: number;
    shares: number;
    reach: number;
    impressions: number;
  }>) {
    totalLikes += s.likes ?? 0;
    totalComments += s.comments ?? 0;
    totalShares += s.shares ?? 0;
    totalReach += s.reach ?? 0;
    totalImpressions += s.impressions ?? 0;
    seen.add(`${s.likes}-${s.comments}-${s.shares}`);
  }

  await supabase.from("analytics_daily").upsert(
    {
      page_id: page.id,
      date: dateStr,
      total_likes: totalLikes,
      total_comments: totalComments,
      total_shares: totalShares,
      total_reach: totalReach,
      total_impressions: totalImpressions,
      post_count: seen.size,
    },
    { onConflict: "page_id,date" },
  );

  return `Aggregated ${data.length} snapshots into ${dateStr} analytics.`;
}

export async function cleanupOldSnapshots(page: Page) {
  const cutoff = new Date(Date.now() - 365 * 86400_000).toISOString();
  const { data, error } = await supabase
    .from("engagement_snapshots")
    .select("id")
    .lt("captured_at", cutoff);
  if (error) {
    log("warn", "Failed to query old snapshots", { page_id: page.id, error: messageOf(error) });
    return "Error querying old snapshots.";
  }
  if (!data || data.length === 0) return "No old snapshots to clean up.";
  const ids = data.map((s: { id: string }) => s.id);
  const { error: deleteError } = await supabase.from("engagement_snapshots").delete().in("id", ids);
  if (deleteError) {
    log("warn", "Failed to delete old snapshots", {
      page_id: page.id,
      error: messageOf(deleteError),
    });
    return "Error deleting old snapshots.";
  }
  return `Cleaned up ${ids.length} snapshots older than 365 days.`;
}
