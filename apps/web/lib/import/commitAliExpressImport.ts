import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMapping } from "@/lib/dropshipEngine";
import type { StagedProduct } from "@/lib/import/staging";
import { linkToNewArrivals } from "./newArrivalsLink";
import { isDisplayableImageUrl } from "./imageUrls";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export interface CommitResult {
  productId: string;
  handle: string;
  isNewProduct: boolean;
  variantIds: string[];
}

/**
 * Writes a reviewed staged product into this store's own products/product_variants/product_media/
 * product_categories tables and registers each variant's mapping back with the engine.
 *
 * Everything written here comes from the staged row as the admin last edited it — the engine fetch
 * and AI rewrite happened when the product was staged, so confirming never re-runs them and never
 * discards a manual edit.
 */
export async function commitAliExpressImport(
  supabase: SupabaseClient,
  params: { tenantId: string; staged: StagedProduct },
): Promise<CommitResult> {
  const { staged } = params;
  const activeSkus = staged.skus.filter((sku) => sku.isActive || sku.stockOnHand > 0 || staged.skus.length === 1);
  const skus = activeSkus.length > 0 ? activeSkus : staged.skus;

  // The store sells in one currency and checkout refuses a cart that mixes them, so a product
  // priced in anything else would be unbuyable alongside the rest of the catalogue. The engine has
  // been seen labelling some imports CNY while the store sells in USD — stop here with a reason
  // rather than publish it; the staging screen lets the admin confirm which currency it really is.
  const { data: settings } = await supabase.from("tenant_settings").select("base_currency").eq("tenant_id", params.tenantId).maybeSingle();
  const storeCurrency = ((settings?.base_currency as string | undefined) ?? "USD").toUpperCase();
  if (staged.currencyCode.toUpperCase() !== storeCurrency) {
    throw new Error(
      `Priced in ${staged.currencyCode} but the store sells in ${storeCurrency}. Open it in staging and confirm the currency before adding it to the store.`,
    );
  }

  // Scoped to this tenant: product_variants has no tenant column of its own, so without the join
  // a product another store had already imported from the same AliExpress listing would be found
  // here — and then overwritten (title, variants, images, categories) by this store's confirm.
  const { data: existingVariant } = await supabase
    .from("product_variants")
    .select("product_id, products!inner(tenant_id)")
    .eq("supplier", "dropship-engine")
    .eq("supplier_product_id", staged.aliexpressProductId)
    .eq("products.tenant_id", params.tenantId)
    .limit(1)
    .maybeSingle();

  let productId: string;
  let handle: string;
  let isNewProduct = false;

  const productFields = {
    packaged_weight_grams: staged.packageWeightGrams,
    title: staged.title,
    short_description: staged.shortDescription || null,
    description: staged.description,
    seo_title: staged.seoTitle,
    seo_desc: staged.seoDesc,
    brand: staged.brand ?? "Mira & Muse",
    status: staged.publish ? "PUBLISHED" : "DRAFT",
  };

  // A previous confirm can have created the product and then failed before any variant was
  // written (engine mapping error, timeout). It has no variant to be found by above, so every
  // retry tried to insert it again and hit the unique handle — stuck for good. Found by handle.
  const newHandle = `${slugify(staged.title)}-${staged.aliexpressProductId}`;
  let resumeProductId: string | null = null;
  if (!existingVariant) {
    const { data: partial } = await supabase.from("products").select("id").eq("tenant_id", params.tenantId).eq("handle", newHandle).maybeSingle();
    resumeProductId = (partial?.id as string | undefined) ?? null;
  }

  if (existingVariant) {
    productId = existingVariant.product_id as string;
    const { data: existingProduct } = await supabase
      .from("products")
      .select("handle, status")
      .eq("id", productId)
      .eq("tenant_id", params.tenantId)
      .single();
    handle = (existingProduct?.handle as string | undefined) ?? slugify(staged.title);
    // Re-confirming refreshes the copy, but never resurrects a product the admin archived.
    const fields = existingProduct?.status === "ARCHIVED" ? { ...productFields, status: "ARCHIVED" } : productFields;
    const { error } = await supabase.from("products").update(fields).eq("id", productId).eq("tenant_id", params.tenantId);
    if (error) throw new Error(`Could not update product: ${error.message}`);
  } else if (resumeProductId) {
    isNewProduct = true;
    productId = resumeProductId;
    handle = newHandle;
    const { error } = await supabase.from("products").update(productFields).eq("id", productId).eq("tenant_id", params.tenantId);
    if (error) throw new Error(`Could not update product: ${error.message}`);
  } else {
    isNewProduct = true;
    handle = newHandle;
    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        tenant_id: params.tenantId,
        product_type: staged.productType,
        handle,
        shipping_class: "STANDARD",
        stock_policy: "IN_STOCK",
        ...productFields,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`Could not create product: ${error?.message}`);
    productId = inserted.id as string;
  }

  const variantIds: string[] = [];
  for (const sku of skus) {
    const { data: upserted, error } = await supabase
      .from("product_variants")
      .upsert(
        {
          product_id: productId,
          title: sku.properties,
          sku: `AE-${sku.aliexpressSkuId}`,
          // Real option columns, so the storefront can render a proper variant picker
          // instead of one opaque "Blue / M" string.
          option1_name: sku.options?.[0]?.name ?? null,
          option1_value: sku.options?.[0]?.value ?? null,
          option2_name: sku.options?.[1]?.name ?? null,
          option2_value: sku.options?.[1]?.value ?? null,
          option3_name: sku.options?.[2]?.name ?? null,
          option3_value: sku.options?.[2]?.value ?? null,
          // The supplier's photo for this SKU's colour, so the storefront can show a colour code
          // like "GN1" as the actual colour and switch the main image when it's picked.
          image_url: sku.options?.find((o) => o.imageUrl && isDisplayableImageUrl(o.imageUrl))?.imageUrl ?? null,
          weight_grams: staged.packageWeightGrams,
          price: sku.retailPriceCents,
          compare_at: sku.compareAtCents,
          currency: staged.currencyCode,
          cost: sku.supplierCostCents,
          margin_rate: sku.marginRate,
          supplier: "dropship-engine",
          supplier_product_id: staged.aliexpressProductId,
          supplier_sku_id: sku.aliexpressSkuId,
          supplier_synced_at: new Date().toISOString(),
          is_active: sku.isActive,
        },
        { onConflict: "product_id,sku" },
      )
      .select("id")
      .single();
    if (error || !upserted) throw new Error(`Could not upsert variant ${sku.aliexpressSkuId}: ${error?.message}`);

    const variantId = upserted.id as string;
    variantIds.push(variantId);
    const { error: stockError } = await supabase
      .from("inventory_items")
      .upsert({ variant_id: variantId, stock_on_hand: sku.stockOnHand }, { onConflict: "variant_id" });
    if (stockError) throw new Error(`Could not set stock for ${sku.aliexpressSkuId}: ${stockError.message}`);

    // Tell the engine which of this store's variants this SKU is, so catalog sync keeps it priced/stocked and fires webhooks on changes.
    await createMapping({
      externalProductId: productId,
      externalVariantId: variantId,
      aliexpressProductId: staged.aliexpressProductId,
      aliexpressSkuId: sku.aliexpressSkuId,
      onBrandName: staged.title,
    });
  }

  // SKUs the supplier no longer offers (or that are out of stock) are left out of the set above —
  // but their variants from an earlier confirm stayed active and buyable. Retire them.
  const keptSkuIds = skus.map((sku) => sku.aliexpressSkuId);
  const { error: retireError } = await supabase
    .from("product_variants")
    .update({ is_active: false })
    .eq("product_id", productId)
    .eq("supplier", "dropship-engine")
    .not("supplier_sku_id", "in", `(${keptSkuIds.map((id) => `"${id}"`).join(",")})`);
  if (retireError) throw new Error(`Could not retire discontinued variants: ${retireError.message}`);

  // Media is synced on EVERY commit, not just for new products: re-confirming an already-imported
  // product (the normal way to pick up corrected images) would otherwise take the update path and
  // never attach them. The staged editor is where images are curated, so it owns the set — replace
  // rather than append, so re-confirming can't accumulate duplicates.
  //
  // Insert the new set first, then remove the old rows by id: delete-then-insert has no
  // transaction around it, so a failed insert used to leave the product with no images at all.
  const displayable = staged.imageUrls.filter((url) => isDisplayableImageUrl(url));
  if (displayable.length > 0) {
    const { data: oldMedia } = await supabase.from("product_media").select("id").eq("product_id", productId);
    const { error: mediaError } = await supabase
      .from("product_media")
      .insert(displayable.map((url, position) => ({ product_id: productId, url, position, alt: staged.title })));
    if (mediaError) throw new Error(`Product saved but its images could not be attached: ${mediaError.message}`);
    const oldIds = ((oldMedia ?? []) as { id: string }[]).map((m) => m.id);
    if (oldIds.length > 0) await supabase.from("product_media").delete().in("id", oldIds);
  }

  // Specifications, synced like media: replaced on every commit so re-confirming picks up
  // supplier changes and edits without duplicating rows.
  if (staged.attributes.length > 0) {
    const { data: oldSpecs } = await supabase.from("product_specs").select("id").eq("product_id", productId);
    const { error: specsError } = await supabase.from("product_specs").insert(
      staged.attributes.map((attr, position) => ({
        product_id: productId,
        group: "Specifications",
        label: attr.name,
        value: attr.value,
        position,
      })),
    );
    if (specsError) throw new Error(`Product saved but its specifications could not be attached: ${specsError.message}`);
    const oldIds = ((oldSpecs ?? []) as { id: string }[]).map((r) => r.id);
    if (oldIds.length > 0) await supabase.from("product_specs").delete().in("id", oldIds);
  }

  if (staged.categoryId) {
    // Only this tenant's categories — the staged row's categoryId is admin-editable input.
    const { data: category } = await supabase.from("categories").select("id").eq("id", staged.categoryId).eq("tenant_id", params.tenantId).maybeSingle();
    if (category) {
      const { error: linkError } = await supabase
        .from("product_categories")
        .upsert({ product_id: productId, category_id: staged.categoryId }, { onConflict: "product_id,category_id" });
      if (linkError) throw new Error(`Product saved but could not be added to its category: ${linkError.message}`);
    }
  }

  // Every new product joins New Arrivals, whatever its main category — it ages out on its own
  // after NEW_ARRIVALS_DAYS (see lib/newArrivals.ts).
  if (isNewProduct) await linkToNewArrivals(supabase, params.tenantId, productId);

  await supabase.from("fulfillment_logs").insert({
    tenant_id: params.tenantId,
    variant_id: variantIds[0] ?? null,
    event: "product_imported",
    detail: {
      aliexpressProductId: staged.aliexpressProductId,
      handle,
      isNewProduct,
      categoryId: staged.categoryId,
      stagedId: staged.id,
    },
  });

  return { productId, handle, isNewProduct, variantIds };
}
