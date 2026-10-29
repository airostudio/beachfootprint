import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { stripe } from "@/lib/checkout/stripe";
import { placeAliExpressOrder } from "@/lib/fulfillment/placeAliExpressOrder";
import { getEmailProvider } from "@/lib/email/getEmailProvider";
import { orderReference } from "@/lib/orderReference";
import { formatMoney } from "@/lib/format";

export const runtime = "nodejs";
// Payment, stock, email and supplier placement all run in one delivery — give it room, rather than
// risk the platform killing it after the order is already marked paid.
export const maxDuration = 60;

/**
 * Stripe's payment callbacks — the only place an order is ever marked paid.
 *
 * The signature is verified against STRIPE_WEBHOOK_SECRET before anything is read, so a forged
 * request can't mark an unpaid order as paid. That means reading the RAW body: any JSON parsing
 * first would change the bytes the signature covers and every event would be rejected.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhooks/stripe] STRIPE_WEBHOOK_SECRET is not set — refusing to process events");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    // An invalid signature is the expected shape of an attack, so it is a 400, not a 500.
    console.error(`[webhooks/stripe] signature verification failed: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceRoleSupabaseClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // `paid` is the real signal; a completed session can still be unpaid for async methods.
        if (session.payment_status !== "paid") {
          console.log(`[webhooks/stripe] session ${session.id} completed but payment_status=${session.payment_status}`);
          break;
        }
        await markOrderPaid(supabase, session);
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        await markOrderPaid(supabase, event.data.object as Stripe.Checkout.Session);
        break;
      }

      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.orderId;
        if (orderId) {
          const { error: paymentError } = await supabase.from("payments").update({ status: "FAILED" }).eq("provider", "stripe").eq("provider_ref", session.id);
          if (paymentError) throw new Error(`Could not mark payment failed: ${paymentError.message}`);
          // Kept as a record rather than deleted, but closed: an order left PENDING_PAYMENT forever
          // inflates the dashboard's pending count and still looks like it might be paid. Only a
          // still-pending order is touched, so a late event can't cancel one that did get paid.
          const { error: cancelError } = await supabase
            .from("orders")
            .update({ status: "CANCELED" })
            .eq("id", orderId)
            .eq("status", "PENDING_PAYMENT");
          if (cancelError) throw new Error(`Could not cancel unpaid order ${orderId}: ${cancelError.message}`);
          console.log(`[webhooks/stripe] order ${orderId} not paid (${event.type}) — canceled`);
        }
        break;
      }

      case "charge.refunded": {
        await recordRefund(supabase, event.data.object as Stripe.Charge);
        break;
      }

      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const intentId = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id;
        const order = intentId ? await orderForPaymentIntent(supabase, intentId) : null;
        if (order) {
          await supabase.from("fulfillment_logs").insert({
            tenant_id: order.tenant_id,
            order_id: order.id,
            event: "payment_disputed",
            detail: { reason: dispute.reason, amount: dispute.amount, currency: dispute.currency, disputeId: dispute.id },
          });
        }
        console.warn(`[webhooks/stripe] dispute ${dispute.id} opened on ${intentId} (order ${order?.id ?? "unknown"})`);
        break;
      }

      default:
        // Everything else is acknowledged so Stripe stops retrying it.
        break;
    }
  } catch (error) {
    // A 500 makes Stripe retry, which is what we want for a transient database failure.
    console.error(`[webhooks/stripe] handling ${event.type} failed: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * Marks the order paid and draws down stock. Safe to run concurrently or twice: Stripe retries
 * events, and `checkout.session.completed` and `async_payment_succeeded` can both arrive for one
 * order — the conditional update below only lets one delivery actually claim the order, and every
 * other delivery (whether it arrives before or after) returns without touching stock or payments.
 */
async function markOrderPaid(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.error(`[webhooks/stripe] session ${session.id} has no orderId in metadata`);
    return;
  }

  const { data: order } = await supabase.from("orders").select("id, tenant_id, status, total").eq("id", orderId).maybeSingle();
  if (!order) {
    console.error(`[webhooks/stripe] order ${orderId} not found for session ${session.id}`);
    return;
  }
  if (order.status !== "PENDING_PAYMENT") {
    console.log(`[webhooks/stripe] order ${orderId} already ${order.status} — ignoring duplicate event`);
    return;
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  // The read above is not a lock: `checkout.session.completed` and `async_payment_succeeded` can
  // both arrive for one order, or Stripe can retry, and two deliveries can both pass that read
  // before either writes. The `.eq("status", "PENDING_PAYMENT")` guard means only the delivery that
  // still finds the row PENDING actually updates it — but only if we check that here. Without this
  // check both deliveries would fall through and double-decrement stock below.
  const { data: claimed, error: orderError } = await supabase
    .from("orders")
    .update({ status: "PAID" })
    .eq("id", orderId)
    .eq("status", "PENDING_PAYMENT")
    .select("id");
  if (orderError) throw new Error(`Could not mark order ${orderId} paid: ${orderError.message}`);
  if (!claimed || claimed.length === 0) {
    console.log(`[webhooks/stripe] order ${orderId} was claimed by a concurrent delivery — skipping`);
    return;
  }

  const { data: paymentRows, error: paymentError } = await supabase
    .from("payments")
    .update({ status: "SUCCEEDED", provider_ref: paymentIntentId ?? session.id, amount: session.amount_total ?? order.total })
    .eq("provider", "stripe")
    .eq("provider_ref", session.id)
    .select("id");
  // The order is already claimed as PAID, so this can't throw (a retry would skip the order as a
  // duplicate and lose the rest of this handler). Record the payment instead, so a refund can find
  // it by payment intent later.
  if (paymentError || !paymentRows || paymentRows.length === 0) {
    console.error(`[webhooks/stripe] order ${orderId}: no payment row for session ${session.id} (${paymentError?.message ?? "none matched"}) — inserting one`);
    await supabase.from("payments").insert({
      order_id: orderId,
      provider: "stripe",
      provider_ref: paymentIntentId ?? session.id,
      status: "SUCCEEDED",
      amount: session.amount_total ?? order.total,
    });
  }

  // Draw down stock for what was actually bought. Read-then-write rather than an atomic
  // decrement because PostgREST has no expression update; oversell risk is bounded by the
  // availability check at session creation and by AliExpress being the real stock authority.
  //
  // That check ran when the Stripe session was created, not now — a slow checkout (or two
  // customers racing for the last unit) can still leave less stock than this order needs by the
  // time payment actually clears. The payment has already succeeded at this point, so this never
  // blocks or reverses the order; it clamps the ledger at zero as before and logs a
  // stock_shortfall entry so it's visible in Orders instead of silently going negative-in-spirit.
  const { data: items } = await supabase.from("order_items").select("variant_id, quantity, title").eq("order_id", orderId);
  for (const item of ((items ?? []) as { variant_id: string; quantity: number; title: string }[])) {
    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("stock_on_hand")
      .eq("variant_id", item.variant_id)
      .maybeSingle();
    if (!inventory) continue;
    const available = inventory.stock_on_hand as number;
    const remaining = Math.max(0, available - item.quantity);
    await supabase.from("inventory_items").update({ stock_on_hand: remaining }).eq("variant_id", item.variant_id);

    if (available < item.quantity) {
      await supabase.from("fulfillment_logs").insert({
        tenant_id: order.tenant_id,
        order_id: orderId,
        variant_id: item.variant_id,
        event: "stock_shortfall",
        detail: { title: item.title, requested: item.quantity, availableAtPayment: available },
      });
      console.warn(`[webhooks/stripe] order ${orderId}: paid for ${item.quantity} × ${item.title}, only ${available} in stock`);
    }
  }

  console.log(`[webhooks/stripe] order ${orderId} PAID (${session.amount_total} ${session.currency}) intent=${paymentIntentId}`);

  await sendOrderConfirmation(session, orderId, order.total, session.currency ?? "usd", (items ?? []) as { quantity: number; title: string }[]);

  // Auto-place with the supplier immediately on payment — no human review gate. A failure here
  // is caught and logged to fulfillment_logs by placeAliExpressOrder itself rather than thrown,
  // so it never turns a successful payment into a 500 that makes Stripe retry the whole handler
  // (which would re-run the payment/stock updates above against an already-PAID order).
  const placement = await placeAliExpressOrder(supabase, orderId);
  if (!placement.ok) {
    console.error(`[webhooks/stripe] order ${orderId} PAID but AliExpress placement failed: ${placement.error}`);
  }
}

/**
 * Fire-and-forget-ish: a failed confirmation email must never fail the webhook, since the
 * payment itself already succeeded and Stripe should not retry the handler over an email issue.
 */
async function sendOrderConfirmation(
  session: Stripe.Checkout.Session,
  orderId: string,
  total: number,
  currency: string,
  items: { quantity: number; title: string }[],
): Promise<void> {
  const to = session.customer_details?.email;
  if (!to) {
    console.log(`[webhooks/stripe] order ${orderId} has no customer email on the Stripe session — skipping confirmation email`);
    return;
  }
  try {
    await getEmailProvider().sendTransactionalEmail({
      to,
      templateKey: "order-confirmation",
      data: {
        orderId,
        orderReference: orderReference(orderId),
        total: formatMoney(total, currency.toUpperCase()),
        items: items.map((item) => ({ name: item.title, quantity: item.quantity })),
      },
    });
  } catch (error) {
    console.error(`[webhooks/stripe] order ${orderId} PAID but confirmation email failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function orderForPaymentIntent(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  intentId: string,
): Promise<{ id: string; tenant_id: string; status: string; aliexpress_order_id: string | null; total: number } | null> {
  const { data: payment } = await supabase.from("payments").select("order_id").eq("provider", "stripe").eq("provider_ref", intentId).maybeSingle();
  if (!payment) return null;
  const { data: order } = await supabase
    .from("orders")
    .select("id, tenant_id, status, aliexpress_order_id, total")
    .eq("id", payment.order_id as string)
    .maybeSingle();
  return (order as { id: string; tenant_id: string; status: string; aliexpress_order_id: string | null; total: number } | null) ?? null;
}

/**
 * A refund issued in the Stripe dashboard used to change nothing here: the order stayed PAID or
 * FULFILLING, still counted as revenue, and a later shipment still emailed the customer. Now the
 * payment and (for a full refund) the order are marked refunded, and the refund is logged — with
 * a warning if the supplier order was already placed, since cancelling that is a manual step on
 * AliExpress that nothing here can do.
 */
async function recordRefund(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, charge: Stripe.Charge) {
  const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!intentId) return;
  const order = await orderForPaymentIntent(supabase, intentId);
  if (!order) {
    console.warn(`[webhooks/stripe] refund on ${intentId} matches no order`);
    return;
  }

  const fullyRefunded = charge.refunded || charge.amount_refunded >= charge.amount;
  const { error: paymentError } = await supabase
    .from("payments")
    .update({ status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" })
    .eq("provider", "stripe")
    .eq("provider_ref", intentId);
  if (paymentError) throw new Error(`Could not record refund on payment: ${paymentError.message}`);

  if (fullyRefunded && order.status !== "REFUNDED") {
    const { error: orderError } = await supabase.from("orders").update({ status: "REFUNDED" }).eq("id", order.id);
    if (orderError) throw new Error(`Could not mark order ${order.id} refunded: ${orderError.message}`);
  }

  await supabase.from("fulfillment_logs").insert({
    tenant_id: order.tenant_id,
    order_id: order.id,
    event: fullyRefunded ? "refunded" : "partially_refunded",
    supplier_order_id: order.aliexpress_order_id,
    detail: {
      amountRefunded: charge.amount_refunded,
      currency: charge.currency,
      ...(order.aliexpress_order_id ? { action: "Supplier order already placed — cancel it on AliExpress if it hasn't shipped." } : {}),
    },
  });
  console.log(`[webhooks/stripe] order ${order.id} ${fullyRefunded ? "refunded" : "partially refunded"} (${charge.amount_refunded} ${charge.currency})`);
}
