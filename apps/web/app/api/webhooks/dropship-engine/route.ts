import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { orderReference } from "@/lib/orderReference";

export const runtime = "nodejs";

type Db = ReturnType<typeof createServiceRoleSupabaseClient>;

interface WebhookEnvelope {
  event: string;
  data: Record<string, unknown>;
  sentAt: string;
}

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.DROPSHIP_ENGINE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function logEvent(supabase: Db, params: { event: string; variantId?: string; orderId?: string; detail?: unknown }): Promise<void> {
  let tenantId: string | undefined;
  if (params.orderId) {
    tenantId = (await supabase.from("orders").select("tenant_id").eq("id", params.orderId).single()).data?.tenant_id;
  } else if (params.variantId) {
    const { data } = await supabase.from("product_variants").select("products(tenant_id)").eq("id", params.variantId).single();
    tenantId = (data as any)?.products?.tenant_id;
  }
  if (!tenantId) return; // variant/order already gone locally — nothing to attribute the log row to

  await supabase.from("fulfillment_logs").insert({
    tenant_id: tenantId,
    order_id: params.orderId ?? null,
    variant_id: params.variantId ?? null,
    event: params.event,
    detail: params.detail ?? null,
  });
}

/**
 * Receives product/order events from the dropship-engine (see its README's
 * webhook list) and applies them to this store's own products/orders —
 * the mirror image of the admin routes that call *into* the engine. Every
 * payload is scoped to this store's own ids (externalProductId/
 * externalVariantId/externalOrderId), never the engine's internal ids.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("X-Dropship-Signature"))) {
    return NextResponse.json({ error: "Invalid or missing signature" }, { status: 401 });
  }

  let envelope: WebhookEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WebhookEnvelope;
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
  }
  const supabase = createServiceRoleSupabaseClient();

  // Every write is checked and a failure returns 500, so the engine retries instead of the update
  // being silently lost behind a 200. Handlers are written to be safe to run twice for that reason.
  try {
    await handleEvent(supabase, envelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[webhooks/dropship-engine] ${envelope.event} failed: ${message}`);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function must(result: { error: { message: string } | null }, what: string): void {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
}

/** Orders in these states are finished from the customer's side — supplier events don't reopen them. */
const CLOSED_STATUSES = new Set(["REFUNDED", "CANCELED", "RETURNED"]);

async function handleEvent(supabase: Db, envelope: WebhookEnvelope): Promise<void> {
  switch (envelope.event) {
    case "product.price_changed": {
      const { externalVariantId, previousPriceCents, newPriceCents } = envelope.data as {
        externalVariantId: string;
        previousPriceCents: number;
        newPriceCents: number;
      };
      must(await supabase.from("product_variants").update({ price: newPriceCents }).eq("id", externalVariantId), "update price");
      await logEvent(supabase, { event: "webhook_price_changed", variantId: externalVariantId, detail: { previousPriceCents, newPriceCents } });
      break;
    }
    case "product.out_of_stock": {
      const { externalVariantId, externalProductId } = envelope.data as { externalVariantId: string; externalProductId: string };
      must(await supabase.from("product_variants").update({ is_active: false }).eq("id", externalVariantId), "deactivate variant");
      must(await supabase.from("inventory_items").update({ stock_on_hand: 0 }).eq("variant_id", externalVariantId), "zero stock");
      await maybeToggleProductStock(supabase, externalProductId);
      await logEvent(supabase, { event: "webhook_out_of_stock", variantId: externalVariantId });
      break;
    }
    case "product.restocked": {
      const { externalVariantId, externalProductId, stockOnHand } = envelope.data as { externalVariantId: string; externalProductId: string; stockOnHand: number };
      must(await supabase.from("product_variants").update({ is_active: true }).eq("id", externalVariantId), "reactivate variant");
      must(await supabase.from("inventory_items").update({ stock_on_hand: stockOnHand }).eq("variant_id", externalVariantId), "set stock");
      must(await supabase.from("products").update({ status: "PUBLISHED" }).eq("id", externalProductId).eq("status", "OUT_OF_STOCK"), "republish product");
      await logEvent(supabase, { event: "webhook_restocked", variantId: externalVariantId, detail: { stockOnHand } });
      break;
    }
    case "order.shipped": {
      const data = envelope.data as { externalOrderId: string; trackingNumber: string; carrier: string; trackingUrl?: string };
      const { data: order, error } = await supabase
        .from("orders")
        .select("id, status, tracking_number, fulfillment_status")
        .eq("id", data.externalOrderId)
        .maybeSingle();
      must({ error }, "load order");
      if (!order) break;

      if (CLOSED_STATUSES.has(order.status as string)) {
        // e.g. refunded after the supplier order went out — record the tracking, but don't tell
        // the customer an order they were refunded for is "on its way".
        await logEvent(supabase, { event: "webhook_shipped_after_close", orderId: data.externalOrderId, detail: { status: order.status, trackingNumber: data.trackingNumber, carrier: data.carrier } });
        break;
      }

      const alreadyNotified = order.tracking_number === data.trackingNumber && ["shipped", "delivered"].includes(order.fulfillment_status as string);
      must(
        await supabase
          .from("orders")
          .update({
            tracking_number: data.trackingNumber,
            carrier: data.carrier,
            // Never move a delivered order back to "shipped" if events arrive out of order.
            ...(order.status === "DELIVERED" ? {} : { status: "FULFILLED", fulfillment_status: "shipped", shipped_at: new Date().toISOString() }),
          })
          .eq("id", data.externalOrderId),
        "mark shipped",
      );
      if (alreadyNotified) break; // a redelivery of the same event — don't email the customer twice

      await logEvent(supabase, { event: "webhook_shipped", orderId: data.externalOrderId, detail: { trackingNumber: data.trackingNumber, carrier: data.carrier } });
      try {
        await notifyCustomerShipped(supabase, data);
      } catch (emailError) {
        // The order is updated; a failed email must not make the engine retry (and re-run) it.
        console.error(`[webhooks/dropship-engine] shipped email for ${data.externalOrderId} failed: ${emailError instanceof Error ? emailError.message : emailError}`);
      }
      break;
    }
    case "order.delivered": {
      const { externalOrderId } = envelope.data as { externalOrderId: string };
      must(
        await supabase
          .from("orders")
          .update({ status: "DELIVERED", fulfillment_status: "delivered" })
          .eq("id", externalOrderId)
          .not("status", "in", "(REFUNDED,CANCELED,RETURNED)"),
        "mark delivered",
      );
      await logEvent(supabase, { event: "webhook_delivered", orderId: externalOrderId });
      break;
    }
    case "order.fulfillment_failed": {
      const { externalOrderId, ...rest } = envelope.data as { externalOrderId: string } & Record<string, unknown>;
      must(await supabase.from("orders").update({ fulfillment_status: "fulfillment_failed" }).eq("id", externalOrderId), "mark fulfillment failed");
      // The engine's reason is kept so the order page can show why, not just that it failed.
      await logEvent(supabase, { event: "webhook_fulfillment_failed", orderId: externalOrderId, detail: rest });
      break;
    }
  }
}

/** If every variant of a product is now out of stock, mark the product itself OUT_OF_STOCK (mirrors the old in-repo engine's behavior). */
async function maybeToggleProductStock(supabase: Db, productId: string): Promise<void> {
  const { data: variants } = await supabase.from("product_variants").select("is_active").eq("product_id", productId);
  if (variants && variants.length > 0 && variants.every((v) => !v.is_active)) {
    await supabase.from("products").update({ status: "OUT_OF_STOCK" }).eq("id", productId).eq("status", "PUBLISHED");
  }
}

async function notifyCustomerShipped(
  supabase: Db,
  event: { externalOrderId: string; trackingNumber: string; carrier: string; trackingUrl?: string },
): Promise<void> {
  const { getEmailProvider } = await import("@/lib/email/getEmailProvider");
  const { data: order } = await supabase.from("orders").select("id, customers(email)").eq("id", event.externalOrderId).single();
  const customerEmail = (order as any)?.customers?.email;
  if (!customerEmail) return;

  await getEmailProvider().sendTransactionalEmail({
    to: customerEmail,
    templateKey: "order-shipped",
    subject: "Your Mira & Muse order has shipped",
    data: { orderId: event.externalOrderId, orderReference: orderReference(event.externalOrderId), trackingNumber: event.trackingNumber, carrier: event.carrier, trackingUrl: event.trackingUrl },
  });
}
