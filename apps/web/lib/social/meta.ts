import "server-only";

/**
 * Minimal Meta Graph API client for posting to the store's Facebook Page and the Instagram
 * professional account linked to it. One Page access token covers both.
 *
 * Configured from Vercel environment variables only — the token is never written to the database
 * or returned to the browser:
 *   META_PAGE_ACCESS_TOKEN     long-lived Page access token (pages_manage_posts,
 *                              pages_read_engagement, instagram_basic, instagram_content_publish)
 *   META_PAGE_ID               the Facebook Page id — enables Facebook posts
 *   META_INSTAGRAM_ACCOUNT_ID  the Instagram professional account id — enables Instagram posts
 *   META_GRAPH_API_VERSION     optional, defaults to DEFAULT_VERSION
 */

export type SocialChannel = "facebook" | "instagram";

export interface MetaConfig {
  token: string;
  version: string;
  pageId: string | null;
  instagramId: string | null;
}

const DEFAULT_VERSION = "v23.0";
const REQUEST_TIMEOUT_MS = 25_000;

export function metaConfig(): MetaConfig | null {
  const token = process.env.META_PAGE_ACCESS_TOKEN?.trim();
  if (!token) return null;
  return {
    token,
    version: process.env.META_GRAPH_API_VERSION?.trim() || DEFAULT_VERSION,
    pageId: process.env.META_PAGE_ID?.trim() || null,
    instagramId: process.env.META_INSTAGRAM_ACCOUNT_ID?.trim() || null,
  };
}

export function configuredChannels(config: MetaConfig | null): SocialChannel[] {
  if (!config) return [];
  const channels: SocialChannel[] = [];
  if (config.pageId) channels.push("facebook");
  if (config.instagramId) channels.push("instagram");
  return channels;
}

/** `transient` errors (Meta outages, rate limits, still processing) are worth retrying later; the rest need someone to fix something. */
export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
  }
}

interface GraphError {
  message?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
  error_user_msg?: string;
}

// 1/2 unknown/service, 4/17/32/613 rate limits, 341 app limit, 368 temporarily blocked.
const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 368, 613]);

function describeError(error: GraphError, httpStatus: number): string {
  const base = error.error_user_msg || error.message || `HTTP ${httpStatus}`;
  const code = error.code ?? 0;
  if (code === 190) return `The Meta access token is invalid or has expired — generate a new long-lived Page token and update META_PAGE_ACCESS_TOKEN. (${base})`;
  // 10 and the 2xx range are Meta's permission errors.
  if (code === 10 || (code >= 200 && code < 300)) {
    return `The Meta token is missing a permission (needs pages_manage_posts, instagram_basic and instagram_content_publish). (${base})`;
  }
  if (code === 100 && /does not exist|cannot be loaded/i.test(base)) {
    return `Meta doesn't recognise that Page or Instagram id — check META_PAGE_ID and META_INSTAGRAM_ACCOUNT_ID. (${base})`;
  }
  if ([4, 17, 32, 613].includes(code)) return `Meta rate limit reached — will try again later. (${base})`;
  return base;
}

async function graph(config: MetaConfig, method: "GET" | "POST", path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const url = `https://graph.facebook.com/${config.version}/${path}`;
  // The token goes in the POST body (or Meta's own query string for GETs), never into anything
  // this app logs or stores.
  const body = new URLSearchParams({ ...params, access_token: config.token });
  let response: Response;
  try {
    response =
      method === "GET"
        ? await fetch(`${url}?${body}`, { cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
        : await fetch(url, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    throw new MetaApiError(`Could not reach Meta: ${err instanceof Error ? err.message : String(err)}`, true);
  }

  const json = (await response.json().catch(() => null)) as (Record<string, unknown> & { error?: GraphError }) | null;
  if (!response.ok || !json || json.error) {
    const error = json?.error ?? {};
    const transient = response.status >= 500 || error.is_transient === true || TRANSIENT_CODES.has(error.code ?? -1);
    throw new MetaApiError(describeError(error, response.status), transient);
  }
  return json;
}

function idOf(result: Record<string, unknown>, field = "id"): string {
  const value = result[field];
  if (typeof value !== "string" || !value) throw new MetaApiError(`Meta's response had no ${field}`, false);
  return value;
}

export interface PublishedPost {
  id: string;
  permalink: string | null;
}

/**
 * Posts to the Facebook Page: one photo, several photos in one post, or (with no photos) a link
 * post, which Facebook illustrates from the product page's own preview image.
 */
export async function postToFacebook(config: MetaConfig, post: { message: string; link: string; imageUrls: string[] }): Promise<PublishedPost> {
  const pageId = config.pageId;
  if (!pageId) throw new MetaApiError("META_PAGE_ID is not set", false);

  if (post.imageUrls.length === 0) {
    const id = idOf(await graph(config, "POST", `${pageId}/feed`, { message: post.message, link: post.link }));
    return { id, permalink: `https://www.facebook.com/${id}` };
  }

  if (post.imageUrls.length === 1) {
    const result = await graph(config, "POST", `${pageId}/photos`, { url: post.imageUrls[0], message: post.message });
    const id = typeof result.post_id === "string" ? result.post_id : idOf(result);
    return { id, permalink: `https://www.facebook.com/${id}` };
  }

  // Several photos in one post: upload each unpublished, then attach them all to a single post.
  const params: Record<string, string> = { message: post.message };
  for (const [i, url] of post.imageUrls.entries()) {
    const photoId = idOf(await graph(config, "POST", `${pageId}/photos`, { url, published: "false" }));
    params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: photoId });
  }
  const id = idOf(await graph(config, "POST", `${pageId}/feed`, params));
  return { id, permalink: `https://www.facebook.com/${id}` };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Instagram fetches and processes the photos asynchronously; publishing before it's done fails. */
async function waitUntilReady(config: MetaConfig, containerId: string): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const result = await graph(config, "GET", containerId, { fields: "status_code,status" });
    if (result.status_code === "FINISHED") return;
    if (result.status_code === "ERROR" || result.status_code === "EXPIRED") {
      throw new MetaApiError(`Instagram couldn't process the photos (${String(result.status ?? result.status_code)})`, false);
    }
    await sleep(2500);
  }
  throw new MetaApiError("Instagram was still processing the photos — will try again", true);
}

/** Posts a single photo, or a carousel of up to 10, to the linked Instagram account. Photos must be JPEG. */
export async function postToInstagram(config: MetaConfig, post: { caption: string; imageUrls: string[] }): Promise<PublishedPost> {
  const igId = config.instagramId;
  if (!igId) throw new MetaApiError("META_INSTAGRAM_ACCOUNT_ID is not set", false);
  if (post.imageUrls.length === 0) throw new MetaApiError("Instagram posts need at least one photo", false);

  let containerId: string;
  if (post.imageUrls.length === 1) {
    containerId = idOf(await graph(config, "POST", `${igId}/media`, { image_url: post.imageUrls[0], caption: post.caption }));
  } else {
    const children: string[] = [];
    for (const url of post.imageUrls.slice(0, 10)) {
      children.push(idOf(await graph(config, "POST", `${igId}/media`, { image_url: url, is_carousel_item: "true" })));
    }
    containerId = idOf(await graph(config, "POST", `${igId}/media`, { media_type: "CAROUSEL", children: children.join(","), caption: post.caption }));
  }

  await waitUntilReady(config, containerId);
  const mediaId = idOf(await graph(config, "POST", `${igId}/media_publish`, { creation_id: containerId }));

  // The post is out at this point — a failure looking up its link mustn't turn it into a "failed" post.
  let permalink: string | null = null;
  try {
    const result = await graph(config, "GET", mediaId, { fields: "permalink" });
    permalink = typeof result.permalink === "string" ? result.permalink : null;
  } catch {
    permalink = null;
  }
  return { id: mediaId, permalink };
}

export interface ConnectionCheck {
  facebook: { ok: boolean; detail: string } | null;
  instagram: { ok: boolean; detail: string } | null;
}

/** Reads back the Page name and Instagram username, proving the token and ids work, without posting anything. */
export async function checkConnection(config: MetaConfig): Promise<ConnectionCheck> {
  const check = async (path: string, fields: string, label: (r: Record<string, unknown>) => string) => {
    try {
      return { ok: true, detail: label(await graph(config, "GET", path, { fields })) };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  };
  return {
    facebook: config.pageId ? await check(config.pageId, "name", (r) => `Page: ${String(r.name ?? config.pageId)}`) : null,
    instagram: config.instagramId ? await check(config.instagramId, "username", (r) => `Account: @${String(r.username ?? config.instagramId)}`) : null,
  };
}
