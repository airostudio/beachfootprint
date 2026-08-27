-- ============================================================
-- Valley Of The Dolls — Demo seed data
-- Run after supabase/schema.sql, e.g.:
--   supabase db execute -f supabase/seed.sql
--
-- Mirrors apps/web/lib/sample-data.ts so the storefront can be re-pointed
-- from the sample-data module to real Supabase queries with matching data.
-- ============================================================

do $$
declare
  v_tenant_id uuid;
  v_zone_id uuid;

  v_cat_dolls uuid; v_cat_dolls_full uuid; v_cat_dolls_torso uuid; v_cat_dolls_compact uuid;
  v_cat_adult uuid; v_cat_accessories uuid; v_cat_care uuid;
  v_cat_new uuid; v_cat_best uuid; v_cat_sale uuid; v_cat_bundles uuid;

  v_prod_aria uuid; v_prod_nova uuid; v_prod_torso uuid; v_prod_stand uuid;
  v_prod_care_kit uuid; v_prod_wig uuid; v_prod_adult1 uuid; v_prod_adult2 uuid;

  v_dollmodel_aria uuid;
  v_group_body uuid; v_group_skin uuid; v_group_head uuid; v_group_eyes uuid;
  v_group_hair uuid; v_group_feature uuid; v_group_accessory uuid;

  v_opt_body_b14 uuid; v_opt_body_b21 uuid; v_opt_body_b33 uuid;
  v_opt_skin_fair uuid; v_opt_skin_tan uuid; v_opt_skin_deep uuid;
  v_opt_head_h10 uuid; v_opt_head_h11 uuid; v_opt_head_h18 uuid; v_opt_head_h25 uuid;
  v_opt_eyes_hazel uuid; v_opt_eyes_blue uuid; v_opt_eyes_grey uuid;
  v_opt_hair_auburn uuid; v_opt_hair_black uuid; v_opt_hair_blonde uuid;
  v_opt_feat_standing uuid; v_opt_feat_heating uuid;
  v_opt_acc_stand uuid; v_opt_acc_care_kit uuid; v_opt_acc_wardrobe uuid;

  v_variant_id uuid;
begin
  -- ── Tenant ──────────────────────────────────────────────────
  insert into tenants (name, slug, is_active)
  values ('Valley Of The Dolls Demo', 'valley-of-the-dolls-demo', true)
  returning id into v_tenant_id;

  insert into tenant_settings (
    tenant_id, brand_name, base_currency, enabled_currencies, cookie_consent_enabled,
    seo_title_default, seo_desc_default,
    age_gate_enabled, age_gate_min_age, age_gate_headline, age_gate_cookie_days,
    discreet_shipping_enabled, discreet_shipping_policy
  ) values (
    v_tenant_id, 'Valley Of The Dolls', 'USD', array['USD'], true,
    'Valley Of The Dolls', 'Private. Premium. Personal.',
    true, 18, 'You must be 18 years or older to enter this website.', 30,
    true, 'Plain outer packaging, no product imagery or descriptive text, neutral billing descriptor where supported.'
  );

  insert into tax_settings (tenant_id, mode, is_tax_inclusive, default_rate_bps)
  values (v_tenant_id, 'MANUAL', false, 0);

  -- ── Shipping ────────────────────────────────────────────────
  insert into shipping_zones (tenant_id, name, countries, is_active)
  values (v_tenant_id, 'United States', array['US'], true)
  returning id into v_zone_id;

  insert into shipping_methods (tenant_id, zone_id, name, price, currency, allowed_shipping_classes, eta_days_min, eta_days_max, is_active)
  values
    (v_tenant_id, v_zone_id, 'Standard Shipping', 799, 'USD', array['STANDARD','HEAVY']::shipping_class[], 3, 5, true),
    (v_tenant_id, v_zone_id, 'Freight Delivery', 14900, 'USD', array['OVERSIZED','FREIGHT','SPECIAL']::shipping_class[], 7, 14, true);

  -- ── Categories ──────────────────────────────────────────────
  insert into categories (tenant_id, name, handle, description) values
    (v_tenant_id, 'Silicone Dolls', 'silicone-dolls', 'Premium silicone companions, fully customisable.')
    returning id into v_cat_dolls;
  insert into categories (tenant_id, parent_id, name, handle) values
    (v_tenant_id, v_cat_dolls, 'Full Body', 'silicone-dolls/full-body') returning id into v_cat_dolls_full;
  insert into categories (tenant_id, parent_id, name, handle) values
    (v_tenant_id, v_cat_dolls, 'Torso', 'silicone-dolls/torso') returning id into v_cat_dolls_torso;
  insert into categories (tenant_id, parent_id, name, handle) values
    (v_tenant_id, v_cat_dolls, 'Compact', 'silicone-dolls/compact') returning id into v_cat_dolls_compact;

  insert into categories (tenant_id, name, handle, description) values
    (v_tenant_id, 'Adult Products', 'adult-products', 'Curated, body-safe intimate products.') returning id into v_cat_adult;
  insert into categories (tenant_id, name, handle, description) values
    (v_tenant_id, 'Accessories', 'accessories', 'Stands, storage, wigs, eyes and replacement parts.') returning id into v_cat_accessories;
  insert into categories (tenant_id, name, handle, description) values
    (v_tenant_id, 'Care & Maintenance', 'care', 'Cleaning, storage and repair essentials.') returning id into v_cat_care;
  insert into categories (tenant_id, name, handle) values (v_tenant_id, 'New Arrivals', 'new-arrivals') returning id into v_cat_new;
  insert into categories (tenant_id, name, handle) values (v_tenant_id, 'Best Sellers', 'best-sellers') returning id into v_cat_best;
  insert into categories (tenant_id, name, handle) values (v_tenant_id, 'Sale', 'sale') returning id into v_cat_sale;
  insert into categories (tenant_id, name, handle) values (v_tenant_id, 'Bundles', 'bundles') returning id into v_cat_bundles;

  -- ── Products ────────────────────────────────────────────────
  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy, production_days, warranty_months)
  values (v_tenant_id, 'SILICONE_DOLL', 'Aria — Configurable Silicone Companion', 'aria-165cm-configurable',
          'Full-body platinum silicone, fully configurable base model.', 'PUBLISHED', 'FREIGHT', 'MADE_TO_ORDER', 14, 12)
  returning id into v_prod_aria;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy, dispatch_days, warranty_months)
  values (v_tenant_id, 'SILICONE_DOLL', 'Nova — Compact 158cm', 'nova-compact-158cm',
          'Lightweight compact frame, ready to ship within 5 days.', 'PUBLISHED', 'OVERSIZED', 'IN_STOCK', 5, 12)
  returning id into v_prod_nova;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy, warranty_months)
  values (v_tenant_id, 'SILICONE_DOLL', 'Sable — Premium Torso', 'sable-torso',
          'Discreet, compact torso form in medical-grade silicone.', 'PUBLISHED', 'HEAVY', 'IN_STOCK', 6)
  returning id into v_prod_torso;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy)
  values (v_tenant_id, 'ACCESSORY', 'Universal Display Stand', 'display-stand-universal',
          'Adjustable stand compatible with most full-body models.', 'PUBLISHED', 'STANDARD', 'IN_STOCK')
  returning id into v_prod_stand;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy)
  values (v_tenant_id, 'CARE_PRODUCT', 'Complete Care Kit', 'complete-care-kit',
          'Everything needed for cleaning, powdering and storage.', 'PUBLISHED', 'STANDARD', 'IN_STOCK')
  returning id into v_prod_care_kit;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy)
  values (v_tenant_id, 'REPLACEMENT_PART', 'Platinum Blonde Wig — Long', 'platinum-blonde-wig',
          'Heat-resistant synthetic fibre, fits standard head sizes.', 'PUBLISHED', 'STANDARD', 'IN_STOCK')
  returning id into v_prod_wig;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy)
  values (v_tenant_id, 'ADULT_PRODUCT', 'Signature Wand Massager', 'signature-wand-massager',
          'Whisper-quiet, medical-grade silicone, 10 intensity levels.', 'PUBLISHED', 'STANDARD', 'IN_STOCK')
  returning id into v_prod_adult1;

  insert into products (tenant_id, product_type, title, handle, short_description, status, shipping_class, stock_policy)
  values (v_tenant_id, 'BUNDLE', 'Aurora Intimate Set', 'aurora-intimate-set',
          'Three-piece curated set at a bundle saving.', 'PUBLISHED', 'STANDARD', 'IN_STOCK')
  returning id into v_prod_adult2;

  -- ── Category assignments ───────────────────────────────────
  insert into product_categories (product_id, category_id) values
    (v_prod_aria, v_cat_dolls), (v_prod_aria, v_cat_dolls_full), (v_prod_aria, v_cat_new),
    (v_prod_nova, v_cat_dolls), (v_prod_nova, v_cat_dolls_compact), (v_prod_nova, v_cat_best),
    (v_prod_torso, v_cat_dolls), (v_prod_torso, v_cat_dolls_torso),
    (v_prod_stand, v_cat_accessories),
    (v_prod_care_kit, v_cat_care),
    (v_prod_wig, v_cat_accessories),
    (v_prod_adult1, v_cat_adult), (v_prod_adult1, v_cat_best),
    (v_prod_adult2, v_cat_adult), (v_prod_adult2, v_cat_bundles), (v_prod_adult2, v_cat_sale);

  -- ── Variants + inventory (one default variant per simple product) ─
  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_nova, 'NOVA-158-DEFAULT', 149900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 6, 2);

  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_torso, 'SABLE-TORSO-DEFAULT', 89900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 4, 2);

  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_stand, 'STAND-UNIV-DEFAULT', 8900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 40, 5);

  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_care_kit, 'CARE-KIT-DEFAULT', 4900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 80, 10);

  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_wig, 'WIG-BLONDE-LONG', 3900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 25, 5);

  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_adult1, 'WAND-SIGNATURE', 12900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 60, 10);

  insert into product_variants (product_id, sku, price, compare_at, currency, is_active)
  values (v_prod_adult2, 'AURORA-SET', 15900, 19900, 'USD', true) returning id into v_variant_id;
  insert into inventory_items (variant_id, stock_on_hand, low_stock_threshold) values (v_variant_id, 30, 5);

  -- ── Doll configurator: Aria ─────────────────────────────────
  insert into doll_models (product_id, height_cm, weight_kg, material, skeleton_spec, standing_capable, heating_compatible)
  values (v_prod_aria, 165, 32, 'Platinum Silicone', 'Articulated stainless steel', false, false)
  returning id into v_dollmodel_aria;

  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'body', 'Body', true, false, 0) returning id into v_group_body;
  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'skin_tone', 'Skin Tone', true, false, 1) returning id into v_group_skin;
  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'head', 'Face / Head', true, false, 2) returning id into v_group_head;
  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'eyes', 'Eyes', true, false, 3) returning id into v_group_eyes;
  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'hair', 'Hair / Wig', true, false, 4) returning id into v_group_hair;
  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'feature', 'Features', false, true, 5) returning id into v_group_feature;
  insert into doll_option_groups (doll_model_id, key, label, is_required, is_multiselect, position) values
    (v_dollmodel_aria, 'accessory', 'Accessories', false, true, 6) returning id into v_group_accessory;

  insert into doll_options (group_id, code, label, price_delta, production_days_delta, is_default) values
    (v_group_body, 'B14', 'Athletic — 165cm', 0, 0, true) returning id into v_opt_body_b14;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_body, 'B21', 'Curvaceous — 168cm', 12000, 2) returning id into v_opt_body_b21;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_body, 'B33', 'Petite — 150cm', -8000, 0) returning id into v_opt_body_b33;

  insert into doll_options (group_id, code, label, is_default) values
    (v_group_skin, 'FAIR', 'Fair', true) returning id into v_opt_skin_fair;
  insert into doll_options (group_id, code, label) values (v_group_skin, 'TAN', 'Tan') returning id into v_opt_skin_tan;
  insert into doll_options (group_id, code, label) values (v_group_skin, 'DEEP', 'Deep') returning id into v_opt_skin_deep;

  insert into doll_options (group_id, code, label, is_default) values
    (v_group_head, 'H10', 'Head 10 — Elise', true) returning id into v_opt_head_h10;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_head, 'H11', 'Head 11 — Noa', 5000, 1) returning id into v_opt_head_h11;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_head, 'H18', 'Head 18 — Wren', 5000, 1) returning id into v_opt_head_h18;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_head, 'H25', 'Head 25 — Mika', 7500, 2) returning id into v_opt_head_h25;

  insert into doll_options (group_id, code, label, is_default) values
    (v_group_eyes, 'HAZEL', 'Hazel', true) returning id into v_opt_eyes_hazel;
  insert into doll_options (group_id, code, label) values (v_group_eyes, 'BLUE', 'Blue') returning id into v_opt_eyes_blue;
  insert into doll_options (group_id, code, label) values (v_group_eyes, 'GREY', 'Grey') returning id into v_opt_eyes_grey;

  insert into doll_options (group_id, code, label, is_default) values
    (v_group_hair, 'AUBURN', 'Auburn Waves', true) returning id into v_opt_hair_auburn;
  insert into doll_options (group_id, code, label) values (v_group_hair, 'BLACK', 'Jet Black Straight') returning id into v_opt_hair_black;
  insert into doll_options (group_id, code, label, price_delta) values
    (v_group_hair, 'BLONDE', 'Platinum Blonde', 1500) returning id into v_opt_hair_blonde;

  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_feature, 'STANDING', 'Standing-capable skeleton', 18000, 2) returning id into v_opt_feat_standing;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_feature, 'HEATING', 'Internal heating system', 22000, 3) returning id into v_opt_feat_heating;

  insert into doll_options (group_id, code, label, price_delta) values
    (v_group_accessory, 'STAND', 'Matching display stand', 8900) returning id into v_opt_acc_stand;
  insert into doll_options (group_id, code, label, price_delta) values
    (v_group_accessory, 'CARE_KIT', 'Complete care kit', 4900) returning id into v_opt_acc_care_kit;
  insert into doll_options (group_id, code, label, price_delta, production_days_delta) values
    (v_group_accessory, 'WARDROBE', '3-piece wardrobe set', 12900, 1) returning id into v_opt_acc_wardrobe;

  -- Petite body only compatible with two of the four heads
  insert into doll_option_rules (doll_model_id, condition_option_id, effect, target_group_key, target_option_codes)
  values (v_dollmodel_aria, v_opt_body_b33, 'allow_only', 'head', array['H10','H18']);

  -- Standing-capable skeleton requires the athletic or curvaceous body
  insert into doll_option_rules (doll_model_id, condition_option_id, effect, target_group_key, target_option_codes)
  values (v_dollmodel_aria, v_opt_feat_standing, 'require', 'body', array['B14','B21']);

  -- Aria's own "variant" is the configured product itself — a base variant
  -- exists so it has a sellable SKU/price floor; configured line items are
  -- captured via order_items + the selected doll_option ids in metadata.
  insert into product_variants (product_id, sku, price, currency, is_active)
  values (v_prod_aria, 'ARIA-165-BASE', 189900, 'USD', true);

  -- ── Compatibility links (accessories, replacement parts, care) ─
  insert into compatibility_links (from_product_id, to_product_id, relation_type) values
    (v_prod_aria, v_prod_stand, 'compatible_accessory'),
    (v_prod_aria, v_prod_care_kit, 'care_product'),
    (v_prod_aria, v_prod_wig, 'compatible_wig'),
    (v_prod_nova, v_prod_care_kit, 'care_product'),
    (v_prod_torso, v_prod_care_kit, 'care_product');

  -- ── Homepage hero banner ────────────────────────────────────
  insert into banners (tenant_id, placement, headline, body, cta_label, cta_href, position, is_active) values
    (v_tenant_id, 'homepage_hero', 'Private. Premium. Personal.',
     'Premium adult products, silicone dolls and accessories through a discreet shopping experience built around privacy, quality and choice.',
     'Shop Products', '/shop', 0, true);

  -- ── Guides (as blog_posts) ──────────────────────────────────
  insert into blog_posts (tenant_id, title, slug, content, status) values
    (v_tenant_id, 'Choosing the Right Doll for You', 'choosing-the-right-doll',
     'A calm, practical walkthrough of body style, height, material and budget.', 'PUBLISHED'),
    (v_tenant_id, 'Silicone vs. TPE: What''s the Difference?', 'silicone-vs-tpe',
     'Durability, realism, care requirements and price compared side by side.', 'PUBLISHED'),
    (v_tenant_id, 'Product Care 101', 'product-care-101',
     'Cleaning, storage and maintenance schedules that extend the life of your product.', 'PUBLISHED'),
    (v_tenant_id, 'How Discreet Shipping Works', 'discreet-shipping-explained',
     'What plain packaging really means and what to expect at delivery.', 'PUBLISHED');

  raise notice 'Seeded tenant %', v_tenant_id;
end $$;
