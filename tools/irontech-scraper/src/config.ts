/**
 * Everything here is a best-effort default. This tool was written without
 * ever being able to load irontechdoll.com from the environment it was
 * built in (network egress to that domain is blocked there) — extraction
 * leads with Schema.org Product JSON-LD (the most standardized, and very
 * commonly present for SEO on e-commerce sites) and falls back to common
 * WooCommerce DOM patterns and Open Graph meta tags. Run `pnpm scrape -- --debug --limit 3`
 * first and eyeball the output before doing a full run; if extraction comes
 * back empty or wrong, this file is where to adjust selectors after
 * inspecting the real page markup (right-click → Inspect on a product page).
 */

export const config = {
  baseUrl: process.env.SOURCE_BASE_URL || "https://irontechdoll.com",
  outputDir: "./output",

  // Politeness: keep this low. You're an authorized reseller crawling a
  // partner's site, not a competitor scraping at scale — there's no reason
  // to hammer it.
  concurrency: 3,
  requestDelayMs: 800,

  // Paths (relative to baseUrl) likely to list products. The crawler also
  // auto-discovers additional shop/category links from the main nav, so
  // this just seeds that discovery — add more if categories are missed.
  shopSeedPaths: ["/", "/shop/", "/product-category/"],

  // Href substrings that mark a link as "worth following as a listing page".
  listingLinkHints: ["/shop", "/product-category", "/category", "/store", "/catalog", "/collections"],

  // Href substrings/patterns that mark a link as a product detail page
  // rather than a listing page. WooCommerce's default is /product/<slug>/.
  productLinkHints: ["/product/"],

  // Common pagination link selector (WooCommerce default). If category
  // pages use infinite scroll or a "Load more" button instead, this won't
  // find later pages — adjust here.
  paginationNextSelector: "a.next.page-numbers, nav.woocommerce-pagination a.next",

  // Hero slideshow container candidates, tried in order until one matches.
  // Covers the most common slider libraries plus a couple of generic
  // fallbacks. Each entry describes how to pull one slide's image/text/link
  // out of one matched slide element.
  heroSliderSelectors: [
    ".slick-slide",
    ".swiper-slide",
    ".owl-item",
    "[class*='hero-slide']",
    "[class*='banner-slide']",
    ".hero-slider img",
  ],

  maxHeroSlides: 8,
} as const;
