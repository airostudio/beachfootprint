import "server-only";
import { waitUntil } from "@vercel/functions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, getTenantId } from "../data/client";
import { isDisplayableImageUrl } from "../import/imageUrls";
import { NEW_ARRIVALS_HANDLE } from "../newArrivals";
import { SITE_URL } from "../siteUrl";
import { buildCaption } from "./caption";
import { configuredChannels, metaConfig, MetaApiError, postToFacebook, postToInstagram, type MetaConfig, type SocialChannel } from "./meta";

/** Retries for Meta outages and rate limits before a post is marked failed. */
const MAX_ATTEMPTS = 4;
/** A post stuck mid-send this long was interrupted (the function was killed). */
const STALE_POSTING_MS = 15 * 60_000;
/**
 * At most this many posts per channel in any 24 hours. A big CSV import would otherwise post
 * hundreds of products back to back — Instagram caps API posts per day anyway, and a burst like
 * that buries the feed. Whatever's left over goes out the next day.
 */
const DAILY_LIMIT = 25;
const FACEBOOK_PHOTOS = 4;
const INSTAGRAM_PHOTOS = 5;

export interface DispatchSummary {
  /** False when no channel is connected — nothing can be posted. */
  configured: boolean;
  posted: number;
  failed: number;
  skipped: number;
  retrying: number;
  /** Still queued — out of time, over the daily limit, or the channel isn't connected yet. */
  remaining: number;
  note: string | null;
}

interface QueueRow {
  id: string;
  product_id: string;
  channel: SocialChannel;
  attempts: number;
}

interface SocialProduct {
  status: string;
  title: string;
  handle: string;
  shortDescription: string | null;
  images: { id: string; url: string }[];
  priceCents: number | null;
  priceVaries: boolean;
  currency: string;
  categoryNames: string[];
  /** Name of the category that keeps this product off social media, if any. */
  excludedBy: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  handle: string;
  parent_id: string | null;
  social_excluded: boolean;
}

async function loadProduct(supabase: SupabaseClient, tenantId: string, productId: string, categories: Map<string, CategoryRow>): Promise<SocialProduct | null> {
  const [productRes, mediaRes, variantRes, linkRes] = await Promise.all([
    supabase.from("products").select("status, title, handle, short_description").eq("id", productId).eq("tenant_id", tenantId).maybeSingle(),
    supabase.from("product_media").select("id, url, position").eq("product_id", productId).order("position"),
    supabase.from("product_variants").select("price, currency, is_active").eq("product_id", productId),
    supabase.from("product_categories").select("category_id").eq("product_id", productId),
  ]);
  for (const res of [productRes, mediaRes, variantRes, linkRes]) {
    if (res.error) throw new MetaApiError(`Could not load the product: ${res.error.message}`, true);
  }
  const product = productRes.data as { status: string; title: string; handle: string; short_description: string | null } | null;
  if (!product) return null;

  const variants = ((variantRes.data ?? []) as { price: number; currency: string; is_active: boolean }[]).filter((v) => v.is_active);
  const prices = variants.map((v) => v.price);

  // A product in a subcategory also belongs to its parent, so a parent switched off covers its
  // children, and the parent's name is a fair hashtag too.
  const names: string[] = [];
  let excludedBy: string | null = null;
  for (const { category_id } of (linkRes.data ?? []) as { category_id: string }[]) {
    const category = categories.get(category_id);
    if (!category) continue;
    const parent = category.parent_id ? categories.get(category.parent_id) : undefined;
    for (const c of [category, parent]) {
      if (!c) continue;
      if (c.social_excluded && !excludedBy) excludedBy = c.name;
      if (c.handle !== NEW_ARRIVALS_HANDLE && !names.includes(c.name)) names.push(c.name);
    }
  }

  return {
    status: product.status,
    title: product.title,
    handle: product.handle,
    shortDescription: product.short_description,
    images: ((mediaRes.data ?? []) as { id: string; url: string }[]).filter((m) => isDisplayableImageUrl(m.url)),
    priceCents: prices.length ? Math.min(...prices) : null,
    priceVaries: new Set(prices).size > 1,
    currency: variants[0]?.currency ?? "USD",
    categoryNames: names,
    excludedBy,
  };
}

async function publish(config: MetaConfig, channel: SocialChannel, product: SocialProduct) {
  const productUrl = `${SITE_URL}/product/${encodeURIComponent(product.handle)}`;
  const captionInput = { ...product, productUrl };
  // Photos go through this store's own image route, which turns each into a 4:5 JPEG. Supplier
  // photos are often WebP (even when named .jpg) and 3:4, and Instagram rejects both; Facebook's
  // photo upload doesn't take WebP either.
  const photo = (m: { id: string }) => `${SITE_URL}/api/social/image/${m.id}`;
  if (channel === "facebook") {
    return postToFacebook(config, {
      message: buildCaption(captionInput, "facebook"),
      link: productUrl,
      imageUrls: product.images.slice(0, FACEBOOK_PHOTOS).map(photo),
    });
  }
  return postToInstagram(config, {
    caption: buildCaption(captionInput, "instagram"),
    imageUrls: product.images.slice(0, INSTAGRAM_PHOTOS).map(photo),
  });
}

/**
 * Works through the social post queue: posts each newly published product to every connected
 * channel. Safe to run concurrently and repeatedly — each post is claimed before it's sent, so two
 * runs never send the same one.
 */
export async function dispatchSocialPosts(options: { deadlineMs?: number; ids?: string[] } = {}): Promise<DispatchSummary> {
  const summary: DispatchSummary = { configured: false, posted: 0, failed: 0, skipped: 0, retrying: 0, remaining: 0, note: null };
  const config = metaConfig();
  const channels = configuredChannels(config);
  if (!config || channels.length === 0) {
    summary.note = "Facebook and Instagram aren't connected yet — set the META_ environment variables in Vercel.";
    return summary;
  }
  summary.configured = true;

  const deadline = Date.now() + (options.deadlineMs ?? 45_000);
  const supabase = db();
  const tenantId = await getTenantId();
  const now = () => new Date().toISOString();

  // Anything left mid-send by a run that was killed. It may or may not have gone out, so it's not
  // retried automatically — someone checks the account and retries it by hand if it's missing.
  await supabase
    .from("social_posts")
    .update({ status: "FAILED", last_error: "Interrupted while posting — check the account (it may have gone out) before retrying.", updated_at: now() })
    .eq("tenant_id", tenantId)
    .eq("status", "POSTING")
    .lt("updated_at", new Date(Date.now() - STALE_POSTING_MS).toISOString());

  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const allowance = new Map<SocialChannel, number>();
  for (const channel of channels) {
    const { count } = await supabase
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .eq("status", "POSTED")
      .gte("posted_at", since);
    allowance.set(channel, Math.max(0, DAILY_LIMIT - (count ?? 0)));
  }

  let query = supabase
    .from("social_posts")
    .select("id, product_id, channel, attempts")
    .eq("tenant_id", tenantId)
    .eq("status", "PENDING")
    .in("channel", channels)
    .lte("next_attempt_at", now())
    .order("created_at")
    .limit(50);
  if (options.ids?.length) query = query.in("id", options.ids);
  const { data: rows, error } = await query;
  if (error) throw new Error(`Could not read the social queue: ${error.message}`);
  const queue = (rows ?? []) as QueueRow[];
  if (queue.length === 0) return summary;

  const { data: categoryRows } = await supabase.from("categories").select("id, name, handle, parent_id, social_excluded").eq("tenant_id", tenantId);
  const categories = new Map(((categoryRows ?? []) as CategoryRow[]).map((c) => [c.id, c]));
  const products = new Map<string, SocialProduct | null>();

  for (const row of queue) {
    // Each post can take a while (Instagram processes photos before publishing), so stop with
    // time to spare and leave the rest queued for the next run.
    if (Date.now() > deadline - 15_000 || (allowance.get(row.channel) ?? 0) <= 0) {
      summary.remaining++;
      continue;
    }

    const attempts = row.attempts + 1;
    const { data: claimed } = await supabase
      .from("social_posts")
      .update({ status: "POSTING", attempts, updated_at: now() })
      .eq("id", row.id)
      .eq("status", "PENDING")
      .select("id");
    if (!claimed?.length) continue;

    const finish = async (fields: Record<string, unknown>) => {
      const { error: saveError } = await supabase.from("social_posts").update({ ...fields, updated_at: now() }).eq("id", row.id);
      if (saveError) console.error(`social_post_save_failed id=${row.id}: ${saveError.message}`);
    };

    try {
      if (!products.has(row.product_id)) products.set(row.product_id, await loadProduct(supabase, tenantId, row.product_id, categories));
      const product = products.get(row.product_id);

      let skip: string | null = null;
      if (!product) skip = "Product no longer exists";
      else if (product.status !== "PUBLISHED") skip = "Product is no longer published";
      else if (product.excludedBy) skip = `In "${product.excludedBy}", which is set not to post to social media`;
      else if (row.channel === "instagram" && product.images.length === 0) skip = "No photo — Instagram posts need at least one";
      if (skip || !product) {
        await finish({ status: "SKIPPED", last_error: skip });
        summary.skipped++;
        continue;
      }

      const result = await publish(config, row.channel, product);
      await finish({ status: "POSTED", external_id: result.id, permalink: result.permalink, posted_at: now(), last_error: null });
      allowance.set(row.channel, (allowance.get(row.channel) ?? 1) - 1);
      summary.posted++;
      console.log(`social_posted channel=${row.channel} product=${row.product_id} id=${result.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const transient = err instanceof MetaApiError ? err.transient : false;
      if (transient && attempts < MAX_ATTEMPTS) {
        // Back off 15 min, 30 min, 1 hour.
        const retryAt = new Date(Date.now() + 15 * 60_000 * 2 ** (attempts - 1)).toISOString();
        await finish({ status: "PENDING", next_attempt_at: retryAt, last_error: message });
        summary.retrying++;
      } else {
        await finish({ status: "FAILED", last_error: message });
        summary.failed++;
      }
      console.error(`social_post_failed channel=${row.channel} product=${row.product_id} transient=${transient}: ${message}`);
    }
  }

  if (summary.remaining > 0) summary.note = `${summary.remaining} still queued — they'll go out on the next run (at most ${DAILY_LIMIT} per channel a day).`;
  return summary;
}

/**
 * Starts working through the queue in the background after the current request has responded,
 * so publishing a product doesn't wait on Facebook and Instagram. Called after anything that can
 * publish products; the daily cron and the admin Social page pick up whatever this misses.
 */
export function kickSocialDispatch(): void {
  if (configuredChannels(metaConfig()).length === 0) return;
  waitUntil(
    dispatchSocialPosts().catch((err) => {
      console.error(`social_dispatch_failed: ${err instanceof Error ? err.message : String(err)}`);
    }),
  );
}
