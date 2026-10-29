import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillOrder, type EngineAddress } from "@/lib/dropshipEngine";

export interface PlaceOrderOutcome {
  ok: boolean;
  skipped?: boolean;
  aliexpressOrderId?: string | null;
  error?: string;
}

/**
 * Places the AliExpress dropshipping order for a paid local order, via the dropship-engine.
 * Idempotency is the engine's job (an atomic claim on its own orders table, keyed by this store's
 * order id) — this just forwards the request and mirrors the result into this store's own
 * `orders` row. Shared by the admin manual-trigger route and the auto-place-on-payment webhook path
 * so there is exactly one implementation of "what it means to place this order".
 */
export async function placeAliExpressOrder(supabase: SupabaseClient, orderId: string): Promise<PlaceOrderOutcome> {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, tenant_id, status, shipping_address, aliexpress_order_id")
    .eq("id", orderId)
    .single();
  if (orderError || !order) return { ok: false, error: "Order not found" };

  // Every outcome that leaves a paid order unplaced is written to fulfillment_logs, not just the
  // engine-call failure below. The webhook path has no human watching it, so an early return that
  // only reports back to its caller is a stuck order nobody can see.
  const logOutcome = async (event: string, detail: Record<string, unknown>, supplierOrderId?: string | null) => {
    const { error } = await supabase.from("fulfillment_logs").insert({
      tenant_id: order.tenant_id,
      order_id: orderId,
      event,
      supplier_order_id: supplierOrderId ?? null,
      detail,
    });
    if (error) console.error(`[fulfillment] order ${orderId}: could not write ${event} log: ${error.message}`);
  };
  const fail = async (error: string): Promise<PlaceOrderOutcome> => {
    await logOutcome("order_place_failed", { error });
    return { ok: false, error };
  };

  // Already with the supplier: nothing to do, and asking again risks a second supplier order.
  if (order.aliexpress_order_id) return { ok: true, skipped: true, aliexpressOrderId: order.aliexpress_order_id as string };
  // Only a paid order is ever placed. Placing an unpaid one spends the merchant's money on an
  // order the customer may never pay for — and moving it out of PENDING_PAYMENT would make the
  // Stripe webhook treat the customer's eventual payment as a duplicate and skip recording it.
  if (order.status !== "PAID") return fail(`Order is ${order.status} — only paid orders are sent to AliExpress`);

  if (!order.shipping_address) return fail("Order has no shipping_address on file");

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("quantity, variant_id, product_variants!inner(supplier)")
    .eq("order_id", orderId);
  if (itemsError) return fail(itemsError.message);

  // order_items -> product_variants is many-to-one, so PostgREST returns the embed as a single
  // object. This used to index it as an array (`product_variants[0]`), which is always undefined
  // on a real response: every item was filtered out, every paid order came back "nothing to
  // place", and none was ever sent to AliExpress. Both shapes are accepted so a typing quirk can't
  // reintroduce that.
  type Embedded = { supplier: string | null };
  const supplierOf = (embed: Embedded | Embedded[] | null | undefined) => (Array.isArray(embed) ? embed[0]?.supplier : embed?.supplier);
  const dropshipItems = ((items ?? []) as unknown as Array<{ quantity: number; variant_id: string; product_variants: Embedded | Embedded[] | null }>).filter(
    (item) => supplierOf(item.product_variants) === "dropship-engine",
  );
  if (dropshipItems.length === 0) {
    // Not an error: an order can be entirely non-dropshipped products, and there is nothing to place.
    await logOutcome("order_place_skipped", { reason: "no dropship-engine items in this order", itemCount: (items ?? []).length });
    return { ok: true, skipped: true };
  }

  // AliExpress requires a phone number on the shipping address. Checkout now requires one, but
  // older orders may lack it — fail closed with a clear, logged reason rather than sending the
  // engine a request it will itself reject less legibly.
  const address = order.shipping_address as EngineAddress;
  if (!address.phone) {
    return fail("Order has no phone number on file — AliExpress requires one to place the order");
  }

  try {
    const result = await fulfillOrder({
      externalOrderId: order.id as string,
      shippingAddress: address,
      lineItems: dropshipItems.map((item) => ({ externalVariantId: item.variant_id, quantity: item.quantity })),
    });

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        aliexpress_order_id: result.aliexpressOrderId,
        fulfillment_status: result.fulfillmentStatus ?? "fulfillment_in_progress",
        fulfilled_at: result.skipped ? undefined : new Date().toISOString(),
        status: result.aliexpressOrderId ? "FULFILLING" : undefined,
      })
      .eq("id", orderId);
    // The supplier order now exists either way, so this is logged loudly but not turned into a
    // failure — retrying would ask the engine to place it again.
    if (updateError) console.error(`[fulfillment] order ${orderId} placed (${result.aliexpressOrderId}) but local update failed: ${updateError.message}`);

    await logOutcome(result.skipped ? "order_place_skipped" : "order_placed", { engineSkipped: Boolean(result.skipped) }, result.aliexpressOrderId);

    return { ok: true, skipped: result.skipped, aliexpressOrderId: result.aliexpressOrderId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress order placement failed";
    return fail(message);
  }
}
