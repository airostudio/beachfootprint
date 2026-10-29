"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, getTenantId } from "@/lib/data/client";
import { isStripeConfigured, stripe } from "@/lib/checkout/stripe";

/**
 * Permanently deletes an order. Its items, payment records and fulfillment log go with it via
 * `on delete cascade`, so this destroys the store's own record of a sale — including, for a paid
 * order, the only local trace of money that actually moved. Stripe keeps its own record either
 * way, and nothing here refunds anything: deleting a paid order does not return the customer's
 * money, it just stops the store showing it. The UI confirms before calling this and says so.
 *
 * Scoped by tenant so an id from another store can't be deleted through this action.
 */
export async function deleteOrder(formData: FormData): Promise<void> {
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) throw new Error("No order id given");

  const tenantId = await getTenantId();

  // An unpaid order can still have an open Stripe Checkout session. Deleting the order without
  // closing that session left a live payment page: the customer could still pay, and the money
  // would land with no order to attach it to. Close it first — and if Stripe says it has already
  // been paid, stop, because the webhook is about to mark this order paid.
  const { data: order } = await db().from("orders").select("status").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  if (order?.status === "PENDING_PAYMENT" && isStripeConfigured()) {
    const { data: payments } = await db().from("payments").select("provider_ref").eq("order_id", orderId).eq("provider", "stripe");
    for (const ref of ((payments ?? []) as { provider_ref: string | null }[]).map((p) => p.provider_ref)) {
      if (!ref?.startsWith("cs_")) continue;
      const session = await stripe().checkout.sessions.retrieve(ref);
      if (session.status === "complete") {
        throw new Error("This order's payment has just gone through on Stripe — it will show as paid shortly, so it can't be deleted as unpaid.");
      }
      if (session.status === "open") await stripe().checkout.sessions.expire(ref);
    }
  }

  const { data, error } = await db().from("orders").delete().eq("tenant_id", tenantId).eq("id", orderId).select("id");
  if (error) throw new Error(`Could not delete the order: ${error.message}`);
  if (!data || data.length === 0) throw new Error("That order no longer exists");

  revalidatePath("/admin/orders");
  revalidatePath("/admin");

  // Deleting from the detail page leaves nowhere to go back to.
  if (String(formData.get("returnTo") ?? "") === "list") redirect("/admin/orders");
}
