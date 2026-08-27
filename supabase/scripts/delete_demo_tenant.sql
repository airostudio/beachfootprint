-- ============================================================
-- Clears the demo catalogue seeded by supabase/seed.sql, keeping the tenant
-- row itself (and its slug) intact — the app is single-tenant right now and
-- resolves everything through DEFAULT_TENANT_SLUG (default
-- "valley-of-the-dolls-demo"), so deleting the tenant row would break the
-- site until that env var were repointed. This just empties it out and
-- renames it, ready for your real catalogue via the importer at
-- /admin/products/import.
--
-- Run once your real data is imported and you're ready to remove the demo
-- content for good. Safe to re-run — a no-op once already empty.
-- ============================================================

update tenants set name = 'Valley Of The Dolls' where slug = 'valley-of-the-dolls-demo';

-- Cascades to product_variants, inventory_items, product_media, product_specs,
-- product_categories, doll_models (+ its option groups/options/rules),
-- compatibility_links, bundle_items, reviews, wishlist_items, etc.
delete from products where tenant_id = (select id from tenants where slug = 'valley-of-the-dolls-demo');

-- Cascades to child categories via parent_id on delete set null, so delete
-- children before parents to avoid leaving orphaned rows with a null parent.
delete from categories
where tenant_id = (select id from tenants where slug = 'valley-of-the-dolls-demo')
  and parent_id is not null;
delete from categories where tenant_id = (select id from tenants where slug = 'valley-of-the-dolls-demo');

delete from banners where tenant_id = (select id from tenants where slug = 'valley-of-the-dolls-demo');
delete from blog_posts where tenant_id = (select id from tenants where slug = 'valley-of-the-dolls-demo');
