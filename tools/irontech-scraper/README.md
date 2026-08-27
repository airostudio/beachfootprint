# IronTech Doll → Valley Of The Dolls importer

Pulls products and the homepage hero slideshow from irontechdoll.com into
this store, for use **only** under an authorized reseller/distributor
relationship with IronTech Doll — this is not a general scraping tool, and
running it against a site you don't have rights to re-publish from is a
copyright problem, not a technical one.

Runs as a standalone tool outside the main app (real internet access is
required; the environment this repo was built in has network egress
blocked to irontechdoll.com, so this could not be run or tested there —
see "Known limitations" below before your first real run).

## Why this is a separate tool, not part of the website

The main app (`apps/web`) and its `/admin/products/import` CSV importer are
designed to run on Vercel, which cannot run a headless browser. Scraping a
JS-rendered storefront needs Playwright, which needs a real machine — so
this runs locally (or on any server you control) and hands off a plain CSV
that the existing importer already knows how to consume.

## Setup

```bash
cd tools/irontech-scraper
pnpm install          # or npm install
npx playwright install chromium
cp .env.example .env  # fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TENANT_SLUG
```

## Usage

```bash
# 1. Do a small test run first — always.
pnpm scrape -- --debug --limit=3

# Eyeball output/products.csv, output/hero-slides.json and output/images/.
# If titles/prices/images look wrong or empty, open src/config.ts and
# src/extract.ts and adjust the selectors after inspecting the real page
# markup (right-click → Inspect on a product page and the homepage).

# 2. Once it looks right, run the full crawl. It's resumable — if it's
# interrupted, just run it again and it picks up where it left off
# (pass --fresh to force a full re-scrape instead).
pnpm scrape

# 3. Re-host the downloaded images in your own Supabase Storage and
# rewrite products.csv's image_urls column to point at them.
pnpm upload-images

# 4. Push the hero slideshow into the `banners` table (re-hosting those
# images too, and pointing the CTA at your own /shop rather than back at
# irontechdoll.com).
pnpm apply-hero
```

Then take `output/products.csv` to `/admin/products/import` in the app —
it handles files of any size via the same chunked pipeline already built
for that page, regardless of how large the IronTech catalogue is.

## What lands where

- **Products** import as `status: DRAFT` on purpose — review pricing,
  wording and images in the admin before publishing each one. Category
  assignment is left blank (IronTech's own categories won't map 1:1 onto
  yours) — assign categories manually after import, or fill in
  `category_handles` in the CSV yourself first if you'd rather batch it.
- **Hero slides** replace whatever's currently in the `homepage_hero`
  banner set for your tenant.

## Known limitations — read before a real run

This was written without ever being able to load irontechdoll.com (network
egress to that domain is blocked in the environment it was built in), so:

- Extraction leads with **Schema.org Product JSON-LD** (very commonly
  present for SEO, and the most reliable source when it exists), then falls
  back to common **WooCommerce** DOM patterns, then **Open Graph** meta
  tags. If the site runs on something else entirely, `--debug --limit=3`
  will make that obvious immediately — empty or clearly-wrong output means
  `src/extract.ts` needs real selectors.
- Listing-page discovery and pagination (`src/config.ts`:
  `listingLinkHints`, `productLinkHints`, `paginationNextSelector`) are
  educated guesses at common patterns, not verified against the real site.
- Hero slideshow extraction tries several common slider library patterns
  (`src/config.ts`: `heroSliderSelectors`) in order and stops at the first
  one that finds slides with images. If none match, it reports zero slides
  rather than guessing wrong.

None of this is exotic to fix — it's a normal "inspect the actual page,
adjust the selector" loop, just one that had to be left to whoever runs
this with real access to the site.

## The current site doesn't read from Supabase yet

Applying this data to `products`/`banners` writes into the real Supabase
tables and is exactly what those tables are for — but the live storefront
(`apps/web/lib/sample-data.ts`) doesn't query Supabase yet; see the main
README's "What's stubbed" section. Imported IronTech products and the new
hero slides will be sitting in the database, correctly, but won't appear on
the live site until that wiring is done.
