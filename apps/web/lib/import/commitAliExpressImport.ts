import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMapping } from "@/lib/dropshipEngine";
import type { ImportProductResult } from "@/lib/dropshipEngine";

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
 * Writes an already-fetched (and already AI-rewritten) AliExpress import into this store's own
 * products/product_variants/product_media/product_categories tables and registers each variant's
 * mapping back with the engine. Shared by the direct one-shot import route and the
 * preview-then-confirm staging flow — the engine call (fetch + AI copy) happens once, upstream of
 * this, so confirming a staged product never re-runs it.
 */
export async function commitAliExpressImport(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    imported: ImportProductResult;
    publish?: boolean;
    /** Category to link the product to (a new product only) — pass the user's choice, or a suggested one, or omit to leave uncategorized. */
    categoryId?: string | null;
  },
): Promise<CommitResult> {
  const { imported } = params;

  const { data: existingVariant } = await supabase
    .from("product_variants")
    .select("product_id")
    .eq("supplier", "dropship-engine")
    .eq("supplier_product_id", imported.aliexpressProductId)
    .limit(1)
    .maybeSingle();

  let productId: string;
  let handle: string;
  let isNewProduct = false;

  if (existingVariant) {
    productId = existingVariant.product_id as string;
    const { data: existingProduct } = await supabase.from("products").select("handle").eq("id", productId).single();
    handle = existingProduct?.handle ?? slugify(imported.onBrandName);
    await supabase.from("products").update({ title: imported.onBrandName, description: imported.description }).eq("id", productId);
  } else {
    isNewProduct = true;
    handle = `${slugify(imported.onBrandName)}-${imported.aliexpressProductId}`;
    const { data: inserted, error } = await supabase
      .from("products")
      .insert({
        tenant_id: params.tenantId,
        product_type: "STANDARD",
        title: imported.onBrandName,
        handle,
        short_description: imported.description.split("\n\n")[0]?.split("\n").slice(1).join(" ").slice(0, 300),
        description: imported.description,
        status: params.publish ? "PUBLISHED" : "DRAFT",
        brand: "Beach Footprints",
        shipping_class: "STANDARD",
        stock_policy: "IN_STOCK",
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`Could not create product: ${error?.message}`);
    productId = inserted.id as string;
  }

  const variantIds: string[] = [];
  for (const sku of imported.skus) {
    const { data: upserted, error } = await supabase
      .from("product_variants")
      .upsert(
        {
          product_id: productId,
          title: sku.properties,
          sku: `AE-${sku.aliexpressSkuId}`,
          price: sku.retailPriceCents,
          currency: imported.currencyCode,
          cost: sku.supplierCostCents,
          margin_rate: sku.marginRate,
          supplier: "dropship-engine",
          supplier_product_id: imported.aliexpressProductId,
          supplier_sku_id: sku.aliexpressSkuId,
          supplier_synced_at: new Date().toISOString(),
          is_active: sku.stockOnHand > 0,
        },
        { onConflict: "product_id,sku" },
      )
      .select("id")
      .single();
    if (error || !upserted) throw new Error(`Could not upsert variant ${sku.aliexpressSkuId}: ${error?.message}`);

    const variantId = upserted.id as string;
    variantIds.push(variantId);
    await supabase.from("inventory_items").upsert({ variant_id: variantId, stock_on_hand: sku.stockOnHand }, { onConflict: "variant_id" });

    // Tell the engine which of this store's variants this SKU is, so catalog sync keeps it priced/stocked and fires webhooks on changes.
    await createMapping({
      externalProductId: productId,
      externalVariantId: variantId,
      aliexpressProductId: imported.aliexpressProductId,
      aliexpressSkuId: sku.aliexpressSkuId,
      onBrandName: imported.onBrandName,
    });
  }

  if (isNewProduct && imported.imageUrls.length > 0) {
    await supabase.from("product_media").insert(imported.imageUrls.map((url, position) => ({ product_id: productId, url, position })));
  }

  if (isNewProduct && params.categoryId) {
    await supabase.from("product_categories").upsert({ product_id: productId, category_id: params.categoryId }, { onConflict: "product_id,category_id" });
  }

  await supabase.from("fulfillment_logs").insert({
    tenant_id: params.tenantId,
    variant_id: variantIds[0] ?? null,
    event: "product_imported",
    detail: { aliexpressProductId: imported.aliexpressProductId, handle, isNewProduct, categoryId: params.categoryId ?? null },
  });

  return { productId, handle, isNewProduct, variantIds };
}
