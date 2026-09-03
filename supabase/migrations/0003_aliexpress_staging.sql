-- ============================================================
-- AliExpress import staging area.
--
-- Products pasted in bulk land here first — fetched from the engine, priced,
-- AI-rewritten and category-suggested — where they can be reviewed and edited
-- before anything is written into `products`. Nothing here is visible to the
-- storefront; a row only becomes a real product when it is confirmed, at which
-- point `confirmed_product_id` records what it became.
--
-- Run after 0002_aliexpress_dropshipping_engine.sql, e.g.:
--   supabase db execute -f supabase/migrations/0003_aliexpress_staging.sql
-- ============================================================

create table if not exists aliexpress_staged_products (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,

  aliexpress_product_id text not null,
  source_url            text,

  -- 'ready'     — fetched and rewritten, awaiting review/confirmation
  -- 'failed'    — the engine or AliExpress rejected it; `error` says why
  -- 'confirmed' — already committed into products (kept as an audit trail)
  status text not null default 'ready',
  error  text,

  -- Editable copy. Seeded from the engine's AI-rewritten output, then owned by
  -- whoever edits the staged listing.
  title             text,
  short_description text,
  description       text,
  seo_title         text,
  seo_desc          text,

  category_id           uuid references categories(id) on delete set null,
  suggested_category_id uuid references categories(id) on delete set null,

  publish       boolean not null default false,
  product_type  product_type not null default 'STANDARD',
  brand         text,

  currency_code text,
  image_urls    jsonb not null default '[]'::jsonb,
  -- [{ aliexpressSkuId, properties, retailPriceCents, compareAtCents, supplierCostCents, marginRate, stockOnHand, isActive }]
  skus          jsonb not null default '[]'::jsonb,
  -- Untouched engine payload, so a staged row can always be re-derived/diffed.
  raw           jsonb,

  confirmed_product_id uuid references products(id) on delete set null,
  confirmed_at         timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create trigger trg_aliexpress_staged_products_updated_at
    before update on aliexpress_staged_products
    for each row execute function set_updated_at();
exception when duplicate_object then null;
end $$;

-- The same AliExpress product may only sit in the staging queue once, but may
-- be re-staged later after it has been confirmed (e.g. to re-import changes).
create unique index if not exists idx_aliexpress_staged_pending_unique
  on aliexpress_staged_products (tenant_id, aliexpress_product_id)
  where status <> 'confirmed';

create index if not exists idx_aliexpress_staged_tenant_status
  on aliexpress_staged_products (tenant_id, status, created_at desc);
