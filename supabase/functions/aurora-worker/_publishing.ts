/**
 * The publishing pipeline: pre-publish validation (image/caption),
 * atomic claim-then-publish to prevent duplicate posts, and the actual
 * Facebook publish attempt with token-expiry handling.
 */
import {
  type Page,
  type Brief,
  supabase,
  log,
  messageOf,
  fetchWithTimeout,
  PAGE_TOKEN,
} from "./_core.ts";
import { isProviderAvailable, recordProviderFailure } from "./_lifecycle.ts";
import { FacebookAdapter, FacebookTokenError } from "./_facebook-adapter.ts";

const platform = new FacebookAdapter();

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function buildCaption(brief: Brief) {
  const tags = (brief.hashtags ?? [])
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .join(" ");
  return [brief.caption ?? "", tags].filter(Boolean).join("\n\n").trim();
}

async function validateImageForPublish(brief: Brief): Promise<{ valid: boolean; error?: string }> {
  if (!brief.image_url) return { valid: true };
  try {
    const response = await fetchWithTimeout(brief.image_url, { method: "HEAD", timeout: 10_000 });
    const contentType = response.headers.get("content-type") ?? "";
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (!contentType.startsWith("image/")) {
      return { valid: false, error: `Image has invalid content-type: ${contentType}` };
    }
    if (contentLength > 8_000_000) {
      return {
        valid: false,
        error: `Image exceeds 8MB (${Math.round(contentLength / 1_000_000)}MB)`,
      };
    }
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Image unreachable: ${messageOf(e)}` };
  }
}

const SPAMMY_PATTERNS = [
  /\b(buy\s+now|click\s+here|free\s+money|act\s+now|limited\s+time|don't\s+miss\s+out)\b/i,
  /\b(follow\s+for\s+follow|like4like|comment4comment)\b/i,
  /\$\d{3,}/,
];

async function validateCaptionForPublish(
  brief: Brief,
): Promise<{ valid: boolean; error?: string }> {
  const caption = buildCaption(brief);
  const isPhoto = !!brief.image_url;
  const maxLen = isPhoto ? 2200 : 63206;
  if (caption.length > maxLen) {
    return {
      valid: false,
      error: `Caption too long (${caption.length}/${maxLen}) for ${isPhoto ? "photo" : "feed"} post`,
    };
  }
  if (!caption.trim() && !isPhoto) {
    return { valid: false, error: "Caption is empty and no image provided" };
  }
  for (const pattern of SPAMMY_PATTERNS) {
    if (pattern.test(caption)) {
      return { valid: false, error: `Caption flagged as spammy: "${caption.match(pattern)?.[0]}"` };
    }
  }
  return { valid: true };
}

export async function publishDuePosts(page: Page) {
  if (!page.fb_page_id) return "Skipped — Facebook page id missing.";
  if (!(await isProviderAvailable("facebook"))) return "Skipped — Facebook API in cooldown.";
  if (!PAGE_TOKEN) return "Skipped — Facebook page token missing.";

  const tokenCheck = await platform.validateToken(PAGE_TOKEN);
  if (!tokenCheck.valid) {
    log("error", "facebook_token_invalid", { page_id: page.id, error: tokenCheck.error });
    await supabase.from("system_events").insert({
      severity: "error",
      category: "facebook_token_expired",
      message: tokenCheck.error ?? "Facebook token invalid before publish.",
      metadata: { page_id: page.id, page_name: page.fb_page_name },
    });
    return `Skipped — ${tokenCheck.error}`;
  }

  const { count: publishedToday, error: countError } = await supabase
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("page_id", page.id)
    .eq("status", "published")
    .gte("published_at", startOfUtcDay(new Date()).toISOString());
  if (countError) throw countError;

  const remaining = Math.max(0, page.max_posts_per_day - (publishedToday ?? 0));
  if (remaining === 0) return "Daily post cap reached.";

  const allowedStatuses = page.posting_mode === "manual" ? ["approved"] : ["approved", "scheduled"];
  const { data, error } = await supabase
    .from("content_briefs")
    .select("*")
    .eq("page_id", page.id)
    .in("status", allowedStatuses)
    .lte("slot_start", new Date().toISOString())
    .order("slot_start")
    .limit(remaining);
  if (error) throw error;

  const briefs = (data ?? []) as Brief[];
  let published = 0;
  let skipped = 0;
  for (const brief of briefs) {
    const imageCheck = await validateImageForPublish(brief);
    if (!imageCheck.valid) {
      log("warn", "pre-publish image validation failed", {
        brief_id: brief.id,
        error: imageCheck.error,
      });
      skipped++;
      continue;
    }
    const captionCheck = await validateCaptionForPublish(brief);
    if (!captionCheck.valid) {
      log("warn", "pre-publish caption validation failed", {
        brief_id: brief.id,
        error: captionCheck.error,
      });
      skipped++;
      continue;
    }
    const claimed = await claimBriefForPublish(brief.id);
    if (!claimed) continue;
    await publishBrief(page, brief, PAGE_TOKEN);
    published += 1;
  }
  return `Published ${published} due posts${skipped > 0 ? ` (${skipped} skipped by validation)` : ""}.`;
}

async function claimBriefForPublish(briefId: string) {
  const { data, error } = await supabase
    .from("content_briefs")
    .update({ status: "publishing", updated_at: new Date().toISOString() })
    .eq("id", briefId)
    .in("status", ["approved", "scheduled"])
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

async function publishBrief(page: Page, brief: Brief, token: string) {
  const caption = buildCaption(brief);
  const idempotencyKey = `fb:${brief.id}`;
  const { error: postError } = await supabase.from("posts").upsert(
    {
      page_id: page.id,
      content_brief_id: brief.id,
      idempotency_key: idempotencyKey,
      status: "pending",
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  );
  if (postError) throw postError;

  try {
    const { fbPostId, permalink } = await platform.publishPost(page, brief, token, caption);
    await supabase
      .from("posts")
      .update({
        fb_post_id: fbPostId,
        fb_permalink_url: permalink,
        status: "published",
        published_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("idempotency_key", idempotencyKey);
    await supabase
      .from("content_briefs")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", brief.id);
  } catch (e) {
    const message = messageOf(e);
    if (e instanceof FacebookTokenError) {
      log("error", "facebook_token_expired", { message: message.slice(0, 200) });
      await supabase.from("system_events").insert({
        severity: "error",
        category: "facebook_token_expired",
        message:
          "Facebook page token has expired. Go to Settings → Facebook page → Test Facebook to update.",
        metadata: { page_id: page.id, page_name: page.fb_page_name },
      });
      await supabase
        .from("posts")
        .update({ status: "failed", last_error: "Facebook token expired. Update in Settings." })
        .eq("idempotency_key", idempotencyKey);
      await supabase
        .from("content_briefs")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", brief.id);
      throw new Error("TOKEN_EXPIRED: Facebook token expired. Update in Settings → Facebook page.");
    }
    await recordProviderFailure("facebook", `Publish: ${message}`);
    await supabase
      .from("posts")
      .update({ status: "failed", last_error: message })
      .eq("idempotency_key", idempotencyKey);
    await supabase
      .from("content_briefs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", brief.id);
    throw e;
  }
}
