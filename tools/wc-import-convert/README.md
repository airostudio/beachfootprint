# WooCommerce product-export → Valley Of The Dolls importer CSV

Converts a WooCommerce product-export `.xlsx` (e.g. IronTech Doll's own
export, under an authorized reseller/distributor relationship) into the CSV
format `apps/web/lib/import/product-import.ts` — and therefore
`/admin/products/import` — already expects.

This is a much better source than scraping: it's the manufacturer's own
structured product data (real prices, real hosted image URLs, real
descriptions), not something reconstructed by guessing at page markup.

## Usage

```bash
pip install pandas openpyxl beautifulsoup4
python3 convert.py wc-product-export.xlsx -o products.csv
```

Then take `products.csv` to `/admin/products/import` — it handles files of
any size via the existing chunked pipeline.

## What it does

- **Classifies `product_type`** from the title + WooCommerce category path:
  care items (glue, cleansing oil, repair gel, ...) → `CARE_PRODUCT`; stands,
  flight cases, connectors, wigs, anything explicitly tagged "Accessories" →
  `ACCESSORY`; torsos → `SILICONE_DOLL` (category `silicone-dolls/torso`);
  anything else tagged "Sex Doll"/"Life Size" → `SILICONE_DOLL`
  (`silicone-dolls/full-body`); everything else → `ADULT_PRODUCT`. All
  keyword matching is **word-boundary**, not substring — a naive substring
  check on `"stand"` originally matched inside `"Standard Series"` (present
  on nearly every doll's categories) and misclassified 133/593 real dolls
  as accessories before this was fixed.
- **Parses the spec table** WooCommerce descriptions here embed as an HTML
  `<table>` (Material, Height, Shoulder Width, Breastline, ...) to populate
  `material`/`height_cm` accurately, rather than guessing from the title.
  Falls back to the "Shop By Material" category and a `\d+cm` regex on the
  title when a product has no spec table.
- **Strips HTML** from descriptions, including a literal `\n` (backslash-n
  as two characters, not a real newline) artifact baked into the source
  export's table markup.
- **Excludes non-product rows** — WooCommerce order-adjustment placeholders
  ("Make Up The Difference In Freight Costs...") and test entries — rather
  than importing them as fake $0 products. Reports what it excluded.
- **All rows land as `status: DRAFT`**, regardless of the source's own
  published state — review pricing, wording, and category assignment for
  *this* store before publishing each one.
- `category_handles` only ever references handles already seeded in
  `supabase/seed.sql` (`silicone-dolls`, `silicone-dolls/full-body`,
  `silicone-dolls/torso`, `accessories`, `care`, `adult-products`) — if the
  real category taxonomy differs, adjust
  `classify_product_type_and_categories()`.

## Verified

Run against a real 593-row IronTech export: output round-trips exactly
through the actual TypeScript CSV chunk parser
(`packages/core/src/csv.ts`) used by the live importer — 591 rows (1 header
+ 590 products), 0 leftover bytes, 0 column-count mismatches. Product-type
distribution after fixes: 546 `SILICONE_DOLL`, 29 `ACCESSORY`, 11
`CARE_PRODUCT`, 4 `ADULT_PRODUCT`.
