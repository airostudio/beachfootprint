-- ============================================================
-- Per-variant image: the photo AliExpress supplies for a colour option (e.g. the swatch image for
-- colour code "GN1"). Lets the storefront show colour codes as the actual colour, and switch the
-- main product image when a colour is picked. Nullable — sizes and products without option images
-- simply have none. Safe to re-run.
-- ============================================================

alter table product_variants add column if not exists image_url text;

-- Backfill from the staging records of already-confirmed AliExpress products: each staged SKU kept
-- its options with their imageUrl, which the original import discarded. Only https URLs (anything
-- else can't be displayed by the storefront's image loader).
update product_variants v
set image_url = img.url
from (
  select sp.confirmed_product_id as product_id,
         sku->>'aliexpressSkuId' as sku_id,
         (select o->>'imageUrl'
            from jsonb_array_elements(coalesce(sku->'options', '[]'::jsonb)) o
           where o->>'imageUrl' like 'https://%'
           limit 1) as url
    from aliexpress_staged_products sp,
         jsonb_array_elements(sp.skus) sku
   where sp.status = 'confirmed' and sp.confirmed_product_id is not null
) img
where v.product_id = img.product_id
  and v.supplier = 'dropship-engine'
  and v.supplier_sku_id = img.sku_id
  and img.url is not null
  and v.image_url is null;
