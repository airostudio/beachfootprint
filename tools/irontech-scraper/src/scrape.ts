import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "./config";
import { extractHeroSlides, extractProduct } from "./extract";
import { PRODUCT_CSV_COLUMNS, parseCsvRows, rowsToCsv, slugify, type ProductCsvRow } from "./csv";
import { runPool, sleep } from "./pool";

const args = process.argv.slice(2);
const DEBUG = args.includes("--debug");
const FRESH = args.includes("--fresh");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : undefined;

const PRODUCTS_CSV_PATH = path.join(config.outputDir, "products.csv");
const HERO_JSON_PATH = path.join(config.outputDir, "hero-slides.json");
const IMAGES_DIR = path.join(config.outputDir, "images");

function log(...parts: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...parts);
}

function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    return true;
  } catch (err) {
    log("  image download failed:", url, (err as Error).message);
    return false;
  }
}

function loadAlreadyScrapedUrls(): Set<string> {
  if (FRESH || !fs.existsSync(PRODUCTS_CSV_PATH)) return new Set();
  // Reads just enough to resume: any URL that already produced a row.
  // (We keep the source URL out of the CSV itself — it's not an import
  // column — so track it in a sibling .resume.json instead.)
  const resumeFile = path.join(config.outputDir, ".resume.json");
  if (!fs.existsSync(resumeFile)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(resumeFile, "utf8")));
  } catch {
    return new Set();
  }
}

async function main() {
  fs.mkdirSync(config.outputDir, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const alreadyScraped = loadAlreadyScrapedUrls();
  const browser = await chromium.launch();
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; ValleyOfTheDollsImportBot/1.0)" });

  // ── Hero slideshow ──────────────────────────────────────────
  log("Fetching homepage for hero slideshow…");
  const homePage = await context.newPage();
  await homePage.goto(config.baseUrl, { waitUntil: "networkidle" });
  const heroSlides = await extractHeroSlides(homePage, config.heroSliderSelectors, config.maxHeroSlides);
  fs.writeFileSync(HERO_JSON_PATH, JSON.stringify(heroSlides, null, 2));
  log(`Found ${heroSlides.length} hero slide(s) → ${HERO_JSON_PATH}`);
  if (DEBUG) console.dir(heroSlides, { depth: null });
  if (heroSlides.length === 0) {
    log("  ⚠ No hero slides matched any known slider pattern — open src/config.ts's heroSliderSelectors and add the real one after inspecting the homepage markup.");
  }

  // ── Discover listing pages ──────────────────────────────────
  const navLinks = await homePage.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
  const listingPages = new Set<string>(
    config.shopSeedPaths.map((p) => absolutize(p, config.baseUrl)),
  );
  for (const href of navLinks) {
    if (config.listingLinkHints.some((hint) => href.includes(hint))) listingPages.add(href);
  }
  log(`Discovered ${listingPages.size} candidate listing page(s).`);

  // ── Crawl listing pages (with pagination) for product URLs ──
  const productUrls = new Set<string>();
  for (const listingUrl of listingPages) {
    let pageUrl: string | null = listingUrl;
    let pageCount = 0;
    while (pageUrl && pageCount < 50) {
      pageCount++;
      const listPage = await context.newPage();
      try {
        await listPage.goto(pageUrl, { waitUntil: "networkidle", timeout: 30_000 });
      } catch (err) {
        log(`  could not load listing page ${pageUrl}: ${(err as Error).message}`);
        await listPage.close();
        break;
      }
      const links = await listPage.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href));
      for (const href of links) {
        if (config.productLinkHints.some((hint) => href.includes(hint))) productUrls.add(href.split("#")[0]);
      }
      const nextHref = await listPage
        .$eval(config.paginationNextSelector, (a) => (a as HTMLAnchorElement).href)
        .catch(() => null);
      await listPage.close();
      pageUrl = nextHref;
      await sleep(config.requestDelayMs);
      if (LIMIT && productUrls.size >= LIMIT) break;
    }
    if (LIMIT && productUrls.size >= LIMIT) break;
  }
  await homePage.close();

  let urls = [...productUrls].filter((u) => !alreadyScraped.has(u));
  if (LIMIT) urls = urls.slice(0, LIMIT);
  log(`Found ${productUrls.size} product URL(s) total, ${urls.length} to scrape this run${alreadyScraped.size ? ` (${alreadyScraped.size} already done, resuming)` : ""}.`);
  if (urls.length === 0) {
    log("Nothing to do — either everything is already scraped, or no product links were found.");
    if (productUrls.size === 0) {
      log("  ⚠ Zero product links matched. Open src/config.ts and check listingLinkHints/productLinkHints against the real nav + product URLs.");
    }
    await browser.close();
    return;
  }

  // ── Scrape each product ──────────────────────────────────────
  const rows: ProductCsvRow[] = [];
  const scrapedUrls = [...alreadyScraped];
  const usedHandles = new Set<string>();

  await runPool(urls, config.concurrency, async (url) => {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const product = await extractProduct(page, url);

      let handle = slugify(product.title);
      let suffix = 2;
      while (usedHandles.has(handle)) handle = `${slugify(product.title)}-${suffix++}`;
      usedHandles.add(handle);

      const imageDir = path.join(IMAGES_DIR, handle);
      const localImages: string[] = [];
      for (let i = 0; i < product.images.length; i++) {
        const ext = path.extname(new URL(product.images[i]).pathname).split("?")[0] || ".jpg";
        const dest = path.join(imageDir, `${String(i + 1).padStart(2, "0")}${ext}`);
        const ok = await downloadImage(product.images[i], dest);
        if (ok) localImages.push(dest);
      }

      rows.push({
        handle,
        title: product.title,
        product_type: "SILICONE_DOLL",
        short_description: product.shortDescription,
        description: product.description,
        price: (product.priceText ?? "").replace(/[^0-9.]/g, ""),
        compare_at: (product.compareAtText ?? "").replace(/[^0-9.]/g, ""),
        sku: product.sku ?? "",
        stock_on_hand: "",
        category_handles: "", // manufacturer categories rarely match your own — assign these in the admin after import
        brand: "IronTech Doll",
        material: product.material ?? "",
        height_cm: product.heightCm ?? "",
        status: "DRAFT", // reviewed and published manually, on purpose
        image_urls: localImages.join("|"), // local paths for now — upload-images.ts rewrites these to public URLs
      });
      scrapedUrls.push(url);
      log(`✓ ${handle} (${product.images.length} image(s), price=${product.priceText ?? "?"})`);
      if (DEBUG) console.dir(product, { depth: null });
    } catch (err) {
      log(`✗ ${url}: ${(err as Error).message}`);
    } finally {
      await page.close();
      await sleep(config.requestDelayMs);
    }
  });

  // Merge with anything already in products.csv from a previous run.
  const priorRows: ProductCsvRow[] = [];
  if (!FRESH && fs.existsSync(PRODUCTS_CSV_PATH)) {
    const parsed = parseCsvRows(fs.readFileSync(PRODUCTS_CSV_PATH, "utf8")).slice(1); // drop header
    for (const cells of parsed) {
      const row = Object.fromEntries(PRODUCT_CSV_COLUMNS.map((c, i) => [c, cells[i] ?? ""])) as ProductCsvRow;
      priorRows.push(row);
    }
  }

  fs.writeFileSync(PRODUCTS_CSV_PATH, rowsToCsv([...priorRows, ...rows]));
  fs.writeFileSync(path.join(config.outputDir, ".resume.json"), JSON.stringify(scrapedUrls));
  log(`Wrote ${priorRows.length + rows.length} product row(s) → ${PRODUCTS_CSV_PATH}`);
  log("Next: pnpm upload-images   (re-hosts downloaded images in your own Supabase Storage)");
  log("Then: drag output/products.csv into /admin/products/import");
  log("And:  pnpm apply-hero      (writes output/hero-slides.json into the banners table)");

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
