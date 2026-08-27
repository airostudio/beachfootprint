import type { Page } from "playwright";

export interface ScrapedProduct {
  sourceUrl: string;
  title: string;
  description: string;
  shortDescription: string;
  priceText: string | null;
  compareAtText: string | null;
  sku: string | null;
  images: string[]; // absolute URLs, first = primary
  material: string | null;
  heightCm: string | null;
  sourceCategories: string[];
}

export interface ScrapedHeroSlide {
  headline: string;
  body: string;
  imageUrl: string | null;
  ctaHref: string | null;
}

/**
 * Layer 1: Schema.org Product JSON-LD. This is the most reliable source
 * when present — it's structured, standardized, and very commonly injected
 * by SEO plugins (Yoast, RankMath, WooCommerce core) independent of theme.
 */
async function extractJsonLd(page: Page): Promise<Record<string, unknown> | null> {
  const blocks = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.map((n) => n.textContent || ""),
  );

  for (const raw of blocks) {
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const node of candidates) {
        const type = node?.["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (types.includes("Product")) return node;
      }
    } catch {
      // not valid JSON, or not the block we want — ignore and keep looking
    }
  }
  return null;
}

// NOTE: no named helper functions (e.g. `const meta = (x) => ...`) inside
// these page.evaluate() callbacks — tsx/esbuild wraps named function-valued
// consts with a __name() call for stack-trace friendliness, but Playwright
// serializes this callback and runs it inside the page's own isolated JS
// context, which has no __name defined, so it throws. Inlining each lookup
// (or using plain non-function consts) avoids it entirely.
async function extractOpenGraph(page: Page): Promise<{ title: string | null; description: string | null; image: string | null }> {
  return page.evaluate(() => ({
    title: document.querySelector('meta[property="og:title"]')?.getAttribute("content") || null,
    description: document.querySelector('meta[property="og:description"]')?.getAttribute("content") || null,
    image: document.querySelector('meta[property="og:image"]')?.getAttribute("content") || null,
  }));
}

/** Layer 2: common WooCommerce DOM fallback for whatever JSON-LD/OG didn't cover. */
async function extractWooCommerceFallback(page: Page) {
  return page.evaluate(() => {
    const priceEl =
      document.querySelector(".summary .price ins .amount") || // sale price
      document.querySelector(".summary .price .amount") ||
      document.querySelector(".price .woocommerce-Price-amount");
    const compareAtEl = document.querySelector(".summary .price del .amount");
    const skuEl = document.querySelector(".sku");
    const shortDescEl = document.querySelector(".woocommerce-product-details__short-description");
    const tabDescEl = document.querySelector("#tab-description");
    const sku = skuEl?.textContent?.trim() || null;
    const description = shortDescEl?.textContent?.trim() || tabDescEl?.textContent?.trim() || null;
    const images = Array.from(document.querySelectorAll(".woocommerce-product-gallery img"))
      .map((img) => (img as HTMLImageElement).src)
      .filter(Boolean);
    const categories = Array.from(document.querySelectorAll(".posted_in a")).map((a) => a.textContent?.trim() || "");
    return {
      price: priceEl?.textContent?.trim() || null,
      compareAt: compareAtEl?.textContent?.trim() || null,
      sku,
      description,
      images,
      categories: categories.filter(Boolean),
    };
  });
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Finds a numeric spec (height, weight) near one of `keywords`, e.g. "Height: 165cm" → "165 cm". */
function findNumericSpec(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const match = text.match(new RegExp(`${kw}\\s*[:：]?\\s*([0-9.]+\\s?(?:cm|kg|lbs)?)`, "i"));
    if (match) return match[1].trim();
  }
  return null;
}

/** Finds a short text spec (material) near one of `keywords`, e.g. "Material: Platinum Silicone." → "Platinum Silicone". */
function findTextSpec(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const match = text.match(new RegExp(`${kw}\\s*[:：]?\\s*([^.\\n,]{2,60})`, "i"));
    if (match) return match[1].trim();
  }
  return null;
}

export async function extractProduct(page: Page, url: string): Promise<ScrapedProduct> {
  const [jsonLd, og, woo, bodyText] = await Promise.all([
    extractJsonLd(page),
    extractOpenGraph(page),
    extractWooCommerceFallback(page),
    page.evaluate(() => document.body.innerText),
  ]);

  const offers = (jsonLd?.offers as Record<string, unknown> | undefined) ?? {};
  const jsonLdImages = jsonLd?.image ? (Array.isArray(jsonLd.image) ? (jsonLd.image as string[]) : [jsonLd.image as string]) : [];

  const title = firstString(jsonLd?.name, og.title, page.url()) ?? url;
  const description = firstString(jsonLd?.description, woo.description, og.description) ?? "";

  return {
    sourceUrl: url,
    title,
    description,
    shortDescription: description.slice(0, 240),
    priceText: firstString(offers.price, woo.price),
    compareAtText: firstString(woo.compareAt),
    sku: firstString(jsonLd?.sku, jsonLd?.mpn, woo.sku),
    images: [...new Set([...jsonLdImages, ...(woo.images ?? []), og.image].filter((x): x is string => Boolean(x)))],
    material: findTextSpec(bodyText, ["material", "made of"]),
    heightCm: findNumericSpec(bodyText, ["height"]),
    sourceCategories: woo.categories ?? [],
  };
}

export async function extractHeroSlides(page: Page, sliderSelectors: readonly string[], max: number): Promise<ScrapedHeroSlide[]> {
  for (const selector of sliderSelectors) {
    const slides = await page.$$eval(
      selector,
      (nodes, max) =>
        nodes.slice(0, max).map((node) => {
          const el = node as HTMLElement;
          const img = el.matches("img") ? (el as HTMLImageElement) : el.querySelector("img");
          const bgImage = getComputedStyle(el).backgroundImage;
          const bgUrlMatch = bgImage?.match(/url\(["']?(.*?)["']?\)/);
          const link = el.matches("a") ? (el as HTMLAnchorElement) : el.querySelector("a");
          const heading = el.querySelector("h1, h2, h3");
          const body = el.querySelector("p");
          return {
            headline: heading?.textContent?.trim() || "",
            body: body?.textContent?.trim() || "",
            imageUrl: img?.src || bgUrlMatch?.[1] || null,
            ctaHref: link?.href || null,
          };
        }),
      max,
    );
    const withImages = slides.filter((s) => s.imageUrl);
    if (withImages.length > 0) return withImages;
  }
  return [];
}
