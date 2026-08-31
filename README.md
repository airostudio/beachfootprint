# Beach Footprints

A boho surf-culture lifestyle e-commerce platform — apparel and accessories, editorial lookbook feel (warm sand, terracotta, sage ocean, surf foam, driftwood tones), sourced via an AliExpress dropshipping pipeline.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth) — `supabase/schema.sql` is the source of truth for the data model, applied directly via the SQL editor or `supabase db execute`, no ORM/migration tool in between
- `packages/db` — a thin `@supabase/supabase-js` client wrapper (browser + service-role factories)
- `packages/core` — provider abstractions (payment, shipping, email, AI), decoupled from any single vendor
- Zod + React Hook Form for validated forms (checkout)
- `apps/worker` — background job scaffold (BullMQ)

## Structure

```
apps/web          Storefront + admin (Next.js App Router)
apps/worker       Background jobs: AliExpress catalog/tracking sync (BullMQ) + CLI scripts
supabase/         schema.sql (tables, enums, RLS) + storage.sql (buckets) + seed.sql (demo catalogue)
                  migrations/ — additive, already-applied changes (see 0002 for the AliExpress engine)
packages/db       @supabase/supabase-js client wrapper (browser + service-role)
packages/core     Provider interfaces (PaymentProvider, ShippingProvider, EmailProvider, AIProvider),
                  shared by storefront + admin
                  aliexpress/    AliExpress Open Platform client (HMAC-SHA256 signing, token refresh)
                  transformer/   35%-margin pricing + boho surf copy rewriter
                  fulfillment/   catalog sync, order placement, tracking-poll orchestration
tools/            Standalone tools that need real internet access or Python
  wc-import-convert   Python original of the WooCommerce .xlsx converter now built into /admin/products/import — kept for local one-off conversions
```

## What's implemented

- **Data model** (`supabase/schema.sql`): tables covering products with a `product_type` enum (`STANDARD` / `ACCESSORY` / `CARE_PRODUCT` / `BUNDLE` / `GIFT_CARD`), structured `product_specs` key/value rows (not a text blob), admin-defined `attribute_definitions`/`product_attribute_values` for flexible filtering, `shipping_class` (standard/heavy/oversized/freight/special) with packaged dimensions, hierarchical categories, `compatibility_links` for cross-product relationships, bundles, wishlists (PIN hash, never plaintext), recently viewed, owned products ("My Products"), returns, warranty claims, support tickets, and CMS pages/banners. **Row Level Security is enabled on every table** — see the policy block at the bottom of the file: tenant staff (via `memberships` + `is_tenant_member()`) can manage their tenant's data, customers can only read/write their own rows, storefront reads are limited to published/active rows, and money-moving tables (`carts`, `orders`, `payments`) have no anon write policy on purpose — those mutations must go through a server route using the service-role client, which bypasses RLS.
- **Verified**: both `supabase/schema.sql` and `supabase/seed.sql` were run end-to-end against a real local Postgres 16 instance (with a stubbed `auth.users`/`auth.uid()` to stand in for Supabase Auth) — every `CREATE TABLE`/`CREATE POLICY` and the full seed insert succeeded.
- **Provider abstractions** (`packages/core`): `PaymentProvider`, `ShippingProvider`, `EmailProvider`, `AIProvider` interfaces with a Stripe adapter skeleton, a flat-rate/threshold shipping adapter, a mock payment provider and console email provider for local dev, and a fully deterministic (no external calls) recommendation engine for the product finder.
- **Storefront**: homepage, `/shop` + nested category routes with database-shaped filtering, product detail pages (gallery, spec tabs, compatible accessories, related products, Product/Article JSON-LD), `/cart`, `/checkout` (React Hook Form + Zod, guest checkout, tokenized-payment messaging), `/compare`, `/product-finder`, `/care`, `/guides`, `sitemap.xml` / `robots.txt`.
- **Account**: orders + timeline, owned products, wishlists (with PIN option), addresses, profile, privacy preferences (recently-viewed opt-out), support (order-reference-first, no unnecessary detail required).
- **Admin**: dashboard, product list, categories, orders, CMS/banner editor — skeleton screens demonstrating the information architecture. The entire `/admin` area and its `/api/admin/*` routes sit behind HTTP Basic Auth (`apps/web/middleware.ts`), gated on a single `ADMIN_PASSWORD` env var — a stopgap until real admin authentication/sessions exist, but enough to keep the import endpoints from being open to the internet.
- **Chunked CSV product import** (`/admin/products/import`): imports a products CSV of any size without hitting a serverless function's request-body ceiling (~4.5MB on Vercel) or execution-duration ceiling. The browser uploads the raw file straight to Supabase Storage via a signed upload URL — the big binary transfer never passes through a Next.js function at all — then an `import_jobs` row tracks a resumable byte-offset cursor while `/api/admin/imports/[id]/process` is called repeatedly, each call fetching and parsing only one small `Range` slice of the file (256KB by default) and upserting that chunk's rows before returning. A hand-rolled, dependency-free CSV chunk parser (`packages/core/src/csv.ts`) carries an incomplete trailing row (`leftover`) across chunk boundaries — verified correct against chunk sizes from 3 bytes to 1000 bytes, including quoted fields with embedded commas and newlines. Row-level errors (bad price, unknown category handle, etc.) are collected without failing the rest of the chunk. The SQL (`storage.sql`'s bucket/policy and the `import_jobs` usage in `schema.sql`) was verified against local Postgres; the live Storage Range-request flow itself could not be exercised end-to-end without a provisioned Supabase project. The importer also accepts an `image_urls` column, writing `product_media` rows for each — a public `product-images` Storage bucket backs this. **Import order is categories, then products, then the rest**: before a chunk's new products are inserted, `apps/web/lib/import/categories.ts` ensures every category handle those rows reference already exists for the tenant — creating any that don't (including "/"-nested ancestors, e.g. `dresses-kimonos/sale` auto-creates `dresses-kimonos` first) — so a product can never land pointing at a category that isn't there yet; only then are products, variants, inventory, specs, images and category links written. **Existing products are always left alone**: a row whose handle already exists for the tenant is skipped entirely (not overwritten) — only new handles get inserted. A separate opt-in checkbox, "mark products not in this file as Out Of Stock", runs once after the whole file finishes: it sets stock to 0 (never deletes or unpublishes) on any tenant product sharing a brand seen in the import whose handle didn't appear anywhere in the file, so re-importing a supplier's latest catalogue can reflect discontinued items without touching unrelated products from other brands.
- **WooCommerce export import** — a much better source than scraping when the source store can supply one: an admin can upload a WooCommerce product-export `.xlsx` (real prices, hosted image URLs, a per-product HTML spec table) directly in `/admin/products/import` (a mode toggle alongside plain CSV), with no local script to run. `apps/web/lib/import/woocommerce.ts` converts it to the standard importer CSV server-side — classifies product type/category from title + category keywords (word-boundary matched, not naive substring), parses the embedded spec table for accurate material, strips HTML and an export artifact (a literal `\n` that triggers HTML5 foster-parenting inside the spec table, concatenating adjacent cells' text with no separator until fixed) — then hands off to the *exact same* tested byte-range chunked processor the CSV path uses, so it inherits the same any-file-size guarantee. Images are referenced from the source's own hosted URLs, not re-downloaded or re-hosted, on purpose. `tools/wc-import-convert/convert.py` is the original Python version this was ported from (kept for local one-off conversions without deploying).
- **Hero slideshow** (`components/HeroSlideshow.tsx`): the homepage hero crossfades between images, in a randomized order picked client-side on each page load (so the server-rendered first paint stays deterministic), on a slow fade (2s crossfade, 6s hold per slide). Falls back to placeholder imagery until real lookbook photography is dropped into `public/hero/` (see the README there).
- **Live Supabase data everywhere** (`apps/web/lib/data/*.ts`): every storefront and admin page reads real Supabase queries — `apps/web/lib/sample-data.ts` is gone. `lib/data/products.ts` builds `ProductSummary`/`ProductDetail` from `products` + `product_variants` (cheapest active variant sets price/compare-at) + `inventory_items` (stock, drives "ready to ship") + `product_media` + `product_specs` + `reviews` (aggregated rating/count) + `compatibility_links` (compatible accessories) + shared-category membership (related products, since the schema has no dedicated "related" relation type); `isNew`/`isBestSeller`/`onSale` come from category membership (assign products to the `new-arrivals`/`best-sellers`/`sale` category handles via the importer's `category_handles` column, same as any other category) plus `onSale` also triggers off a variant's `compare_at`. `lib/data/cms.ts`/`guides.ts` read `banners`/`blog_posts` (two small additive columns — `blog_posts.category`/`excerpt` and `banners.secondary_cta_label`/`secondary_cta_href` — were added for these; see `supabase/migrations/0001_guides_and_hero_secondary_cta.sql` for an already-applied database). Everything queries through the service-role client scoped to `tenant_id` and (for storefront reads) `status = 'PUBLISHED'`, since there's no live Supabase Auth session yet to carry RLS. A few product-detail fields have no schema home (FAQs, "what's included") and stay as generic static copy rather than fabricated per-product claims — `care`/`delivery`/`warranty` summaries prefer real `products` columns when set and fall back to the same generic copy otherwise. Pages that now query the database are marked `export const dynamic = "force-dynamic"` so Next doesn't try to prerender them at build time without live credentials.
- **Demo data cleanup**: `supabase/scripts/delete_demo_tenant.sql` empties out the seeded demo catalogue (products, categories, banners, guides — cascades handle the rest) while keeping the tenant row/slug intact, so `DEFAULT_TENANT_SLUG` doesn't need to change. Run it once your real catalogue is imported.
- **Beach Footprints AliExpress dropshipping engine** (`packages/core/src/{aliexpress,transformer,fulfillment}`, `supabase/migrations/0002_aliexpress_dropshipping_engine.sql`): an API-driven catalog + fulfillment pipeline layered onto the same tenant/product/order schema, unit-tested with 35 passing tests (`pnpm test`) against recorded API-shaped fixtures — no live AliExpress credentials were available to verify against the real gateway, so the request/response shapes follow the Open Platform's documented method names and field conventions and should be spot-checked against a real account before going live.
  - **`aliexpress/client.ts`** — `AliExpressClient`: TOP-style request signing (all params sorted by key, HMAC-SHA256 with the app secret, uppercase hex), a refresh-and-retry-once path for expired-token errors, and typed methods for `aliexpress.ds.product.get`, `aliexpress.ds.freight.query`, `aliexpress.ds.order.create`, `aliexpress.ds.trade.order.get`, and `aliexpress.logistics.ds.tracking.info.query`, each with a normalizer that digs the payload out of the gateway's nested `result` shape defensively (missing/renamed fields degrade instead of throwing mid-sync).
  - **`transformer/pricing.ts`** — `calculateRetailPrice(supplierCostCents, marginRate = 0.35)`: cost × 1.35, rounded up to the nearest `.95` (never down, and a landed whole-dollar amount is left alone) — the spec's own example, $16.00 → $21.60 → $21.95, is a unit test. `diffPriceChange` compares a freshly-fetched supplier cost against what's stored so the daily sync can log real changes only.
  - **`transformer/copy.ts`** — strips dropshipping-listing buzzwords ("2026 Hot Sale", "Dropship", "Sexy", "Free Shipping", marketplace suffixes after a `|`), renames into a coastal/boho style ("Floral Kimono Coverup" → "Sun-Drenched Boho Coastal Kimono"), and builds the four-section description (The Vibe / Fit & Features / Fabric & Care / Shipping & Delivery). `rewriteProductCopy` takes an optional `CopyProvider` (an LLM hook, same shape as `packages/core`'s existing `AIProvider`) and falls back to this offline template on any provider error, so ingestion never blocks on an external API being down — no LLM adapter ships by default, wire one up by implementing `CopyProvider`.
  - **`fulfillment/service.ts`** — `importProductFromAliExpress`/`upsertProductFromDetail` (new products land `DRAFT` for review; a re-import of a known supplier product id updates in place rather than duplicating), `runDailyCatalogSync` (reconciles stock + price per tenant, logs every real price change to `product_price_log`, flips a product to `OUT_OF_STOCK`/back to `PUBLISHED` as its variants sell out/restock, and treats a supplier-side fetch failure — e.g. a delisted product — as unavailable rather than leaving stale stock counts), `placeAliExpressOrder` (idempotent via an atomic `UPDATE … WHERE fulfillment_status = 'unfulfilled' RETURNING`-style claim, so a retried or duplicated webhook can never place the same order twice), and `pollTrackingUpdates` (detects the shipped/delivered transition and fires a notify callback once). Every one of these writes an entry to `fulfillment_logs`, readable via `GET /api/admin/fulfillment/logs`.
  - **Scheduling**: `apps/worker/src/queue.ts` registers the catalog sync as a BullMQ repeatable job at `0 2 * * *` (02:00 UTC daily) and tracking polling at `0 */5 * * *` (every 5 hours, inside the spec's 4-6 hour window) — needs `REDIS_URL`; `apps/worker/src/index.ts` logs and no-ops instead of crashing when it's unset, so the CLI scripts below still work with zero infra.
  - **CLI** (`pnpm run <script> --`, forwarding into `apps/worker`): `import:aliexpress -- --id=<productId>`, `sync:aliexpress`, `fulfill:aliexpress -- --order-id=<localOrderId>`, `sync:tracking`, plus `auth:aliexpress` — a one-time OAuth helper (not part of daily operation) that turns an AliExpress Open Platform app key/secret into the initial `ALIEXPRESS_ACCESS_TOKEN`/`ALIEXPRESS_REFRESH_TOKEN` pair: `auth:aliexpress -- --url --redirect-uri=<callback>` prints the authorization link to visit, then `auth:aliexpress -- --code=<code from the redirect> --redirect-uri=<same callback>` exchanges it for tokens. After that, `AliExpressClient` refreshes the access token on its own.
  - **Admin API**: `POST /api/admin/products/aliexpress/import`, `POST /api/admin/orders/:id/place-aliexpress`, `POST /api/admin/sync/tracking`, `GET /api/admin/fulfillment/logs` — all under the same `/api/admin/*` HTTP Basic Auth gate as the rest of admin.
  - Orders have no live checkout → `orders` write path yet (see below), so `placeAliExpressOrder` reads `orders.shipping_address`, a new denormalized jsonb snapshot column — once checkout is wired, populate it from the order's chosen address at write time rather than joining `addresses` live, so a later address edit/delete can't retroactively change what was already shipped to.

## What's stubbed / not wired to a live backend

- No real payment processing (Stripe adapter is implemented against the SDK shape but untested against a live account; mock provider is the default).
- Supabase Auth (sign-up/sign-in) is not connected. Because of that, three pages are honest empty/placeholder states rather than showing fabricated per-customer data: `/account/wishlist` (wishlists are per-customer — `wishlists`/`wishlist_items` — and need a signed-in customer to scope the query), and `/cart` starts empty (no fake line items) since there's no cart persistence (`carts`/`cart_items`) wired to "Add to Cart" yet — once that's built, this page renders whatever's actually in the cart with no code change needed. Storage/R2 image uploads beyond the WooCommerce/CSV importer's own paths, and transactional email sending (Resend/Postmark), are also not connected — `EmailProvider`/console adapter exist as the integration point.
- Cart/checkout state is client-local for demonstration; wiring to `carts`/`orders` and a server route using the service-role client (see `packages/db`) is the next step. The admin dashboard's revenue/order KPIs (`lib/data/admin.ts`) already query real `orders`/`payments` tables, so they'll show real numbers as soon as checkout writes to them — they're legitimately all zero right now.
- Generated TypeScript types (`packages/db/src/database.types.ts`) are a placeholder — run `pnpm db:types` against a live project to replace them.
- `next/font` (Google Fonts) was intentionally left out of `app/layout.tsx` in favor of a system-font stack, since this sandbox has no network access to fonts.googleapis.com — reinstate `next/font/google` (or self-host font files) once deploying somewhere with normal network access.
- The homepage hero slideshow (`components/HeroSlideshow.tsx`) currently renders placeholder imagery — drop real lookbook photos into `apps/web/public/hero/` (see the README there for expected filenames) and they'll render immediately, no code change needed.

## Local development

```bash
pnpm install
pnpm dev          # apps/web on :3000

# Against a Supabase project:
pnpm schema       # prints how to apply supabase/schema.sql
pnpm seed         # prints how to apply supabase/seed.sql
pnpm db:types     # regenerate packages/db/src/database.types.ts (needs SUPABASE_PROJECT_ID)
pnpm test         # packages/core unit tests (pricing, copy rewriter, AliExpress client, fulfillment service) — vitest, no live credentials needed

# AliExpress dropshipping engine CLI (needs the ALIEXPRESS_* and SUPABASE_* env vars below):
pnpm import:aliexpress -- --id=<productId>
pnpm sync:aliexpress
pnpm fulfill:aliexpress -- --order-id=<localOrderId>
pnpm sync:tracking

# One-time OAuth setup to obtain ALIEXPRESS_ACCESS_TOKEN/ALIEXPRESS_REFRESH_TOKEN
# (needs only ALIEXPRESS_APP_KEY, then also ALIEXPRESS_APP_SECRET for the second step):
pnpm auth:aliexpress -- --url --redirect-uri=<callback URL>
pnpm auth:aliexpress -- --code=<code from the redirect> --redirect-uri=<same callback URL>
```

Required env vars once wiring pages to real data (`.env.local` in `apps/web`, plus server-only vars wherever `createServiceRoleSupabaseClient` runs):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=   # server-only — never expose to the browser
DEFAULT_TENANT_SLUG=          # optional, used by the CSV importer until admin auth resolves a tenant from a session
ADMIN_PASSWORD=                # protects /admin and /api/admin/* with HTTP Basic Auth — see middleware.ts

# AliExpress Open Platform / Dropshipping API (see packages/core/src/aliexpress)
ALIEXPRESS_APP_KEY=
ALIEXPRESS_APP_SECRET=
ALIEXPRESS_ACCESS_TOKEN=
ALIEXPRESS_REFRESH_TOKEN=

REDIS_URL=                     # apps/worker only — required to run the scheduled catalog-sync/tracking-sync BullMQ jobs; the CLI scripts don't need it
```

Also apply `supabase/storage.sql` (creates the private `imports` bucket used by the CSV importer) alongside `schema.sql`.
