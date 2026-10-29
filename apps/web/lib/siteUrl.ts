/**
 * The store's canonical public URL, for the sitemap, robots.txt and metadata. These all used to
 * point at https://example.com, so every sitemap entry and canonical/OG URL named the wrong site.
 * Set NEXT_PUBLIC_SITE_URL per deployment; the production domain is the fallback.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://shopmiramuse.com").replace(/\/$/, "");
