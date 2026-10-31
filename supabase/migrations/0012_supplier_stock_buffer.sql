-- ============================================================
-- Units held back from AliExpress stock (apps/web/lib/stock.ts). The store's copy of supplier
-- stock can be hours old and other stores sell from the same pool, so a colour/size shows as sold
-- out while the supplier still has a couple left. Editable in Admin -> Payments -> Shipping & Tax.
-- Safe to re-run.
-- ============================================================
alter table tenant_settings
  add column if not exists supplier_stock_buffer integer not null default 2
  check (supplier_stock_buffer >= 0 and supplier_stock_buffer <= 50);
