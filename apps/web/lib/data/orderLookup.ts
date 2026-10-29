import "server-only";
import { db, getTenantId } from "./client";
import { orderReference, parseOrderReference } from "../orderReference";

export interface LookedUpOrder {
  reference: string;
  placedAt: string;
  status: string;
  fulfillmentStatus: string | null;
  currency: string;
  totalCents: number;
  items: { title: string; quantity: number; lineTotalCents: number }[];
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
}

/**
 * Finds a customer's order by the email it was placed under plus its reference (first 8 chars of
 * the id). There are no customer accounts yet, so this pairing is the customer's proof the order
 * is theirs: the reference alone is short and shown in emails, so it's never enough on its own.
 * Callers rate-limit it.
 *
 * Filtering by the reference prefix happens in code, after narrowing to that email's orders —
 * PostgREST can't pattern-match a uuid column, and this way an email with no orders costs one
 * query and reveals nothing about anyone else's.
 */
export async function lookupOrder(email: string, referenceInput: string): Promise<LookedUpOrder | null> {
  const prefix = parseOrderReference(referenceInput);
  const normalizedEmail = email.trim().toLowerCase();
  if (!prefix || !normalizedEmail.includes("@")) return null;

  const tenantId = await getTenantId();
  const supabase = db();
  const { data: customers } = await supabase.from("customers").select("id").eq("tenant_id", tenantId).ilike("email", normalizedEmail);
  const customerIds = ((customers ?? []) as { id: string }[]).map((c) => c.id);
  if (customerIds.length === 0) return null;

  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, status, fulfillment_status, currency, total, carrier, tracking_number, shipped_at")
    .eq("tenant_id", tenantId)
    .in("customer_id", customerIds)
    .order("created_at", { ascending: false })
    .limit(200);
  const order = ((orders ?? []) as Array<Record<string, unknown>>).find((o) => (o.id as string).startsWith(prefix));
  if (!order) return null;

  const { data: items } = await supabase.from("order_items").select("title, quantity, line_total").eq("order_id", order.id as string);

  return {
    reference: orderReference(order.id as string),
    placedAt: order.created_at as string,
    status: order.status as string,
    fulfillmentStatus: (order.fulfillment_status as string | null) ?? null,
    currency: order.currency as string,
    totalCents: order.total as number,
    items: ((items ?? []) as { title: string; quantity: number; line_total: number }[]).map((i) => ({
      title: i.title,
      quantity: i.quantity,
      lineTotalCents: i.line_total,
    })),
    carrier: (order.carrier as string | null) ?? null,
    trackingNumber: (order.tracking_number as string | null) ?? null,
    shippedAt: (order.shipped_at as string | null) ?? null,
  };
}
