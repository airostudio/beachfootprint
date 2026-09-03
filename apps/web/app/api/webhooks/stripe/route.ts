import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { stripe } from "@/lib/checkout/stripe";

export const runtime = "nodejs";

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
          await supabase.from("payments").update({ status: "FAILED" }).eq("provider", "stripe").eq("provider_ref", session.id);
          // The order is left as-is rather than deleted: an abandoned checkout is a real record,
          // and the customer may retry.
          console.log(`[webhooks/stripe] order ${orderId} not paid (${event.type})`);
        }
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
 * Marks the order paid and draws down stock. Safe to run twice: Stripe retries events, and
 * `checkout.session.completed` and `async_payment_succeeded` can both arrive for one order, so
 * this returns early if the order is already past PENDING_PAYMENT.
 */
async function markOrderPaid(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) {
    console.error(`[webhooks/stripe] session ${session.id} has no orderId in metadata`);
    return;
  }

  const { data: order } = await supabase.from("orders").select("id, status, total").eq("id", orderId).maybeSingle();
  if (!order) {
    console.error(`[webhooks/stripe] order ${orderId} not found for session ${session.id}`);
    return;
  }
  if (order.status !== "PENDING_PAYMENT") {
    console.log(`[webhooks/stripe] order ${orderId} already ${order.status} — ignoring duplicate event`);
    return;
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;

  const { error: orderError } = await supabase.from("orders").update({ status: "PAID" }).eq("id", orderId).eq("status", "PENDING_PAYMENT");
  if (orderError) throw new Error(`Could not mark order ${orderId} paid: ${orderError.message}`);

  await supabase
    .from("payments")
    .update({ status: "SUCCEEDED", provider_ref: paymentIntentId ?? session.id, amount: session.amount_total ?? order.total })
    .eq("provider", "stripe")
    .eq("provider_ref", session.id);

  // Draw down stock for what was actually bought. Read-then-write rather than an atomic
  // decrement because PostgREST has no expression update; oversell risk is bounded by the
  // availability check at session creation and by AliExpress being the real stock authority.
  const { data: items } = await supabase.from("order_items").select("variant_id, quantity").eq("order_id", orderId);
  for (const item of ((items ?? []) as { variant_id: string; quantity: number }[])) {
    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("stock_on_hand")
      .eq("variant_id", item.variant_id)
      .maybeSingle();
    if (!inventory) continue;
    const remaining = Math.max(0, (inventory.stock_on_hand as number) - item.quantity);
    await supabase.from("inventory_items").update({ stock_on_hand: remaining }).eq("variant_id", item.variant_id);
  }

  console.log(`[webhooks/stripe] order ${orderId} PAID (${session.amount_total} ${session.currency}) intent=${paymentIntentId}`);
}
