import type { SupabaseClient } from "@supabase/supabase-js";
import { AliExpressClient, AliExpressApiError } from "../aliexpress/client";
import { toAliExpressAddress } from "../aliexpress/address";
import type { AliExpressProductDetail } from "../aliexpress/types";
import { DEFAULT_MARGIN_RATE, calculateRetailPrice, diffPriceChange } from "../transformer/pricing";
import { rewriteProductCopy, formatStructuredDescription, type CopyProvider } from "../transformer/copy";
import type { Address } from "../types";
import type { CatalogSyncSummary, PlaceOrderResult, ShippingConfirmationEvent, TrackingSyncSummary } from "./types";

// packages/db's generated Database type is currently a placeholder (`any`),
// so this layer takes a loosely-typed client — callers pass their real
// (typed once generated) service-role client from @trend/db.
type DB = SupabaseClient<any, any, any>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function logFulfillmentEvent(
  db: DB,
  params: { tenantId: string; orderId?: string; variantId?: string; event: string; supplierOrderId?: string; detail?: unknown },
): Promise<void> {
  await db.from("fulfillment_logs").insert({
    tenant_id: params.tenantId,
    order_id: params.orderId ?? null,
    variant_id: params.variantId ?? null,
    event: params.event,
    supplier_order_id: params.supplierOrderId ?? null,
    detail: params.detail ?? null,
  });
}

// ── Product ingestion / reconciliation ─────────────────────────────────

export interface UpsertProductFromDetailParams {
  tenantId: string;
  detail: AliExpressProductDetail;
  marginRate?: number;
  copyProvider?: CopyProvider;
  /** New products land as DRAFT for admin review; resync of an existing product never changes its status here — see reconcileProductStock. */
  publishNewProducts?: boolean;
}

export interface UpsertProductFromDetailResult {
  productId: string;
  handle: string;
  isNewProduct: boolean;
  variantIds: string[];
  totalStockOnHand: number;
  priceChangeCount: number;
}

export async function upsertProductFromDetail(db: DB, params: UpsertProductFromDetailParams): Promise<UpsertProductFromDetailResult> {
  const { tenantId, detail } = params;
  const marginRate = params.marginRate ?? DEFAULT_MARGIN_RATE;

  const { onBrandName, description } = await rewriteProductCopy(
    {
      rawTitle: detail.subject,
      rawDescriptionHtml: detail.detail,
      estimatedDeliveryDays: undefined,
    },
    params.copyProvider,
  );
  const formattedDescription = formatStructuredDescription(description);

  // Reuse the existing product if this supplier product was imported before.
  const { data: existingVariant } = await db
    .from("product_variants")
    .select("product_id")
    .eq("supplier", "aliexpress")
    .eq("supplier_product_id", detail.product_id)
    .limit(1)
    .maybeSingle();

  let productId: string;
  let handle: string;
  let isNewProduct = false;

  if (existingVariant) {
    productId = existingVariant.product_id as string;
    const { data: existingProduct } = await db.from("products").select("handle").eq("id", productId).single();
    handle = existingProduct?.handle ?? slugify(onBrandName);
    await db
      .from("products")
      .update({ title: onBrandName, description: formattedDescription, short_description: description.theVibe.slice(0, 300) })
      .eq("id", productId);
  } else {
    isNewProduct = true;
    handle = `${slugify(onBrandName)}-${detail.product_id}`;
    const { data: inserted, error } = await db
      .from("products")
      .insert({
        tenant_id: tenantId,
        product_type: "STANDARD",
        title: onBrandName,
        handle,
        short_description: description.theVibe.slice(0, 300),
        description: formattedDescription,
        status: params.publishNewProducts ? "PUBLISHED" : "DRAFT",
        brand: "Beach Footprints",
        shipping_class: "STANDARD",
        stock_policy: "IN_STOCK",
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`Could not create product for AliExpress ${detail.product_id}: ${error?.message}`);
    productId = inserted.id as string;
  }

  // Diff existing variants (for price-change logging) before overwriting.
  const { data: existingRows } = await db
    .from("product_variants")
    .select("id, supplier_sku_id, cost, price")
    .eq("product_id", productId)
    .eq("supplier", "aliexpress");
  const existingBySkuId = new Map((existingRows ?? []).map((row: any) => [row.supplier_sku_id as string, row]));

  let priceChangeCount = 0;
  let totalStockOnHand = 0;
  const variantIds: string[] = [];

  for (const sku of detail.ae_item_sku_info_dtos) {
    const supplierCostCents = Math.round(parseFloat(sku.sku_price) * 100);
    const existing = existingBySkuId.get(sku.sku_id);
    const diff = diffPriceChange({
      variantId: existing?.id ?? "",
      previousCostCents: existing?.cost ?? null,
      previousPriceCents: existing?.price ?? null,
      newSupplierCostCents: supplierCostCents,
      marginRate,
    });

    const variantTitle = sku.sku_properties?.map((p) => p.property_value_definition_name).join(" / ") || null;
    const { data: upserted, error } = await db
      .from("product_variants")
      .upsert(
        {
          product_id: productId,
          title: variantTitle,
          sku: `AE-${sku.sku_id}`,
          price: diff.newPriceCents,
          currency: sku.currency_code ?? detail.currency_code ?? "USD",
          cost: supplierCostCents,
          margin_rate: marginRate,
          supplier: "aliexpress",
          supplier_product_id: detail.product_id,
          supplier_sku_id: sku.sku_id,
          supplier_synced_at: new Date().toISOString(),
          is_active: sku.sku_available_stock > 0,
        },
        { onConflict: "product_id,sku" },
      )
      .select("id")
      .single();
    if (error || !upserted) throw new Error(`Could not upsert variant ${sku.sku_id}: ${error?.message}`);

    variantIds.push(upserted.id as string);
    totalStockOnHand += sku.sku_available_stock;

    await db
      .from("inventory_items")
      .upsert({ variant_id: upserted.id, stock_on_hand: sku.sku_available_stock }, { onConflict: "variant_id" });

    if (existing && diff.changed) {
      priceChangeCount += 1;
      await db.from("product_price_log").insert({
        variant_id: existing.id,
        previous_cost: diff.previousCostCents,
        new_cost: diff.newCostCents,
        previous_price: diff.previousPriceCents,
        new_price: diff.newPriceCents,
        margin_rate: marginRate,
        reason: "supplier_price_change",
      });
    }
  }

  if (isNewProduct && detail.image_urls) {
    const urls = detail.image_urls.split(";").map((u) => u.trim()).filter(Boolean);
    if (urls.length > 0) {
      await db.from("product_media").insert(urls.map((url, position) => ({ product_id: productId, url, position })));
    }
  }

  return { productId, handle, isNewProduct, variantIds, totalStockOnHand, priceChangeCount };
}

export interface ImportProductParams {
  tenantId: string;
  aliexpressProductId: string;
  marginRate?: number;
  copyProvider?: CopyProvider;
  publishNewProducts?: boolean;
}

export async function importProductFromAliExpress(
  db: DB,
  client: AliExpressClient,
  params: ImportProductParams,
): Promise<UpsertProductFromDetailResult> {
  const detail = await client.getProductDetail(params.aliexpressProductId);
  const result = await upsertProductFromDetail(db, {
    tenantId: params.tenantId,
    detail,
    marginRate: params.marginRate,
    copyProvider: params.copyProvider,
    publishNewProducts: params.publishNewProducts,
  });
  await logFulfillmentEvent(db, {
    tenantId: params.tenantId,
    variantId: result.variantIds[0],
    event: "product_imported",
    detail: { aliexpressProductId: params.aliexpressProductId, handle: result.handle, isNewProduct: result.isNewProduct },
  });
  return result;
}

/**
 * Daily reconciliation: re-fetches every AliExpress-linked product for the
 * tenant, updates stock/price via upsertProductFromDetail, then rolls the
 * per-variant stock up to a product-level status: OUT_OF_STOCK when every
 * variant is unavailable, back to PUBLISHED on restock. Never touches a
 * product a merchant has manually ARCHIVED or left in DRAFT.
 */
export async function runDailyCatalogSync(db: DB, client: AliExpressClient, params: { tenantId: string; marginRate?: number }): Promise<CatalogSyncSummary> {
  const summary: CatalogSyncSummary = {
    tenantId: params.tenantId,
    productsChecked: 0,
    variantsReconciled: 0,
    priceChanges: 0,
    productsMarkedOutOfStock: 0,
    productsRestocked: 0,
    errors: [],
  };

  const { data: linkedVariants } = await db
    .from("product_variants")
    .select("supplier_product_id, products!inner(tenant_id)")
    .eq("supplier", "aliexpress")
    .eq("products.tenant_id", params.tenantId)
    .not("supplier_product_id", "is", null);

  const supplierProductIds = [...new Set((linkedVariants ?? []).map((row: any) => row.supplier_product_id as string))];

  for (const supplierProductId of supplierProductIds) {
    summary.productsChecked += 1;
    try {
      const detail = await client.getProductDetail(supplierProductId);
      const result = await upsertProductFromDetail(db, { tenantId: params.tenantId, detail, marginRate: params.marginRate });
      summary.variantsReconciled += result.variantIds.length;
      summary.priceChanges += result.priceChangeCount;

      const { data: product } = await db.from("products").select("status").eq("id", result.productId).single();
      if (product?.status === "PUBLISHED" && result.totalStockOnHand === 0) {
        await db.from("products").update({ status: "OUT_OF_STOCK" }).eq("id", result.productId);
        summary.productsMarkedOutOfStock += 1;
      } else if (product?.status === "OUT_OF_STOCK" && result.totalStockOnHand > 0) {
        await db.from("products").update({ status: "PUBLISHED" }).eq("id", result.productId);
        summary.productsRestocked += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push({ supplierProductId, message });

      // Fetch failed (e.g. delisted supplier-side) — treat as unavailable rather than leaving stale stock counts.
      const { data: staleVariants } = await db
        .from("product_variants")
        .select("id, product_id")
        .eq("supplier", "aliexpress")
        .eq("supplier_product_id", supplierProductId);
      for (const variant of staleVariants ?? []) {
        await db.from("product_variants").update({ is_active: false }).eq("id", (variant as any).id);
        await db.from("inventory_items").update({ stock_on_hand: 0 }).eq("variant_id", (variant as any).id);
      }
      const productId = (staleVariants as any[] | null)?.[0]?.product_id;
      if (productId) {
        const { data: product } = await db.from("products").select("status").eq("id", productId).single();
        if (product?.status === "PUBLISHED") {
          await db.from("products").update({ status: "OUT_OF_STOCK" }).eq("id", productId);
          summary.productsMarkedOutOfStock += 1;
        }
      }
    }
  }

  await logFulfillmentEvent(db, { tenantId: params.tenantId, event: "catalog_sync_run", detail: summary });
  return summary;
}

// ── Order placement ─────────────────────────────────────────────────────

const DEFAULT_LOGISTICS_SERVICE = "CAINIAO_STANDARD";

export async function placeAliExpressOrder(
  db: DB,
  client: AliExpressClient,
  params: { orderId: string; logisticsServiceName?: string },
): Promise<PlaceOrderResult> {
  // Idempotency: atomically claim the order — a row is only returned if it
  // was still `unfulfilled` with no supplier order id yet, so a duplicate
  // invocation (retry, double webhook delivery) is a no-op.
  const { data: claimed } = await db
    .from("orders")
    .update({ fulfillment_status: "fulfillment_in_progress" })
    .eq("id", params.orderId)
    .eq("fulfillment_status", "unfulfilled")
    .is("aliexpress_order_id", null)
    .select("id, tenant_id, shipping_address")
    .maybeSingle();

  if (!claimed) {
    const { data: existing } = await db
      .from("orders")
      .select("id, aliexpress_order_id, fulfillment_status")
      .eq("id", params.orderId)
      .single();
    return {
      orderId: params.orderId,
      skipped: true,
      aliexpressOrderId: existing?.aliexpress_order_id ?? null,
      fulfillmentStatus: existing?.fulfillment_status ?? null,
    };
  }

  const tenantId = claimed.tenant_id as string;
  await logFulfillmentEvent(db, { tenantId, orderId: params.orderId, event: "order_place_attempt" });

  try {
    const address = claimed.shipping_address as Address | null;
    if (!address) throw new Error("Order has no shipping_address on file");

    const { data: items, error: itemsError } = await db
      .from("order_items")
      .select("quantity, variant_id, product_variants!inner(supplier, supplier_product_id, supplier_sku_id)")
      .eq("order_id", params.orderId);
    if (itemsError) throw new Error(itemsError.message);

    const dropshipItems = (items ?? []).filter((item: any) => item.product_variants?.supplier === "aliexpress");
    if (dropshipItems.length === 0) throw new Error("Order has no AliExpress-sourced line items to place");

    const result = await client.createOrder({
      outOrderId: params.orderId,
      logisticsAddress: toAliExpressAddress(address),
      items: dropshipItems.map((item: any) => ({
        productId: item.product_variants.supplier_product_id,
        skuId: item.product_variants.supplier_sku_id,
        quantity: item.quantity,
        logisticsServiceName: params.logisticsServiceName ?? DEFAULT_LOGISTICS_SERVICE,
      })),
    });

    await db
      .from("orders")
      .update({ aliexpress_order_id: result.orderId, fulfillment_status: "fulfillment_in_progress", fulfilled_at: new Date().toISOString(), status: "FULFILLING" })
      .eq("id", params.orderId);
    await logFulfillmentEvent(db, {
      tenantId,
      orderId: params.orderId,
      event: "order_placed",
      supplierOrderId: result.orderId,
      detail: { itemCount: dropshipItems.length },
    });

    return { orderId: params.orderId, skipped: false, aliexpressOrderId: result.orderId, fulfillmentStatus: "fulfillment_in_progress" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Release the claim so a corrected retry (e.g. after fixing the address) can proceed.
    await db.from("orders").update({ fulfillment_status: "unfulfilled" }).eq("id", params.orderId);
    await logFulfillmentEvent(db, {
      tenantId,
      orderId: params.orderId,
      event: "order_place_failed",
      detail: { message, code: err instanceof AliExpressApiError ? err.code : undefined },
    });
    throw err;
  }
}

// ── Tracking sync ────────────────────────────────────────────────────────

export async function pollTrackingUpdates(
  db: DB,
  client: AliExpressClient,
  params: { tenantId: string },
  notify?: (event: ShippingConfirmationEvent) => void | Promise<void>,
): Promise<TrackingSyncSummary> {
  const summary: TrackingSyncSummary = { tenantId: params.tenantId, polled: 0, shipped: 0, delivered: 0, errors: [] };

  const { data: orders } = await db
    .from("orders")
    .select("id, aliexpress_order_id, tracking_number, status")
    .eq("tenant_id", params.tenantId)
    .eq("fulfillment_status", "fulfillment_in_progress")
    .not("aliexpress_order_id", "is", null);

  for (const order of orders ?? []) {
    summary.polled += 1;
    try {
      const detail = await client.getOrderDetail((order as any).aliexpress_order_id);
      const logistics = detail.logistics_info_list?.[0];
      const isDelivered = detail.order_status === "FINISH";
      const isShipped = Boolean(logistics?.logistics_no);

      if (isDelivered) {
        await db
          .from("orders")
          .update({ status: "DELIVERED", fulfillment_status: "delivered" })
          .eq("id", (order as any).id);
        await logFulfillmentEvent(db, {
          tenantId: params.tenantId,
          orderId: (order as any).id,
          event: "delivered",
          supplierOrderId: (order as any).aliexpress_order_id,
        });
        summary.delivered += 1;
      } else if (isShipped) {
        const alreadyShipped = Boolean((order as any).tracking_number);
        await db
          .from("orders")
          .update({
            status: "FULFILLED",
            fulfillment_status: "shipped",
            tracking_number: logistics!.logistics_no,
            carrier: logistics!.logistics_company,
            shipped_at: new Date().toISOString(),
          })
          .eq("id", (order as any).id);

        if (!alreadyShipped) {
          summary.shipped += 1;
          await logFulfillmentEvent(db, {
            tenantId: params.tenantId,
            orderId: (order as any).id,
            event: "shipped",
            supplierOrderId: (order as any).aliexpress_order_id,
            detail: { trackingNumber: logistics!.logistics_no, carrier: logistics!.logistics_company },
          });
          await notify?.({
            orderId: (order as any).id,
            trackingNumber: logistics!.logistics_no,
            carrier: logistics!.logistics_company,
            trackingUrl: logistics!.tracking_url,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push({ orderId: (order as any).id, message });
    }
  }

  return summary;
}
