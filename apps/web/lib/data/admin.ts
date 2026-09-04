import "server-only";
import { db, getTenantId } from "./client";

export interface DashboardKpis {
  revenueCents30d: number;
  orders30d: number;
  avgOrderValueCents: number;
  pendingOrders: number;
  fulfillingOrders: number;
  lowStockItems: number;
  currency: string;
}

const REVENUE_STATUSES = ["PAID", "FULFILLING", "FULFILLED", "DELIVERED"];

/** All real — this store has no live checkout wired up yet (see README), so these are legitimately zero until orders exist. */
export async function getDashboardKpis(): Promise<DashboardKpis> {
  const tenantId = await getTenantId();
  const supabase = db();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: orders }, { count: pendingOrders }, { count: fulfillingOrders }, { data: productIds }] = await Promise.all([
    supabase.from("orders").select("total, currency, status").eq("tenant_id", tenantId).gte("created_at", since),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "PENDING_PAYMENT"),
    supabase.from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "FULFILLING"),
    supabase.from("products").select("id").eq("tenant_id", tenantId),
  ]);

  const revenueOrders = (orders ?? []).filter((o) => REVENUE_STATUSES.includes(o.status as string));
  const revenueCents30d = revenueOrders.reduce((sum, o) => sum + (o.total as number), 0);
  const currency = (revenueOrders[0]?.currency as string) ?? "USD";

  let lowStockItems = 0;
  const ids = ((productIds ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length > 0) {
    const { data: variants } = await supabase.from("product_variants").select("id").in("product_id", ids);
    const variantIds = ((variants ?? []) as { id: string }[]).map((v) => v.id);
    if (variantIds.length > 0) {
      // PostgREST filters compare a column to a literal, not another column —
      // fetch both and compare in JS rather than reach for a DB view/RPC for this.
      const { data: inv } = await supabase.from("inventory_items").select("stock_on_hand, low_stock_threshold").in("variant_id", variantIds);
      lowStockItems = ((inv ?? []) as { stock_on_hand: number; low_stock_threshold: number }[]).filter(
        (i) => i.stock_on_hand <= i.low_stock_threshold,
      ).length;
    }
  }

  return {
    revenueCents30d,
    orders30d: revenueOrders.length,
    avgOrderValueCents: revenueOrders.length > 0 ? Math.round(revenueCents30d / revenueOrders.length) : 0,
    pendingOrders: pendingOrders ?? 0,
    fulfillingOrders: fulfillingOrders ?? 0,
    lowStockItems,
    currency,
  };
}

export interface AdminOrderSummary {
  id: string;
  createdAt: string;
  status: string;
  fulfillmentStatus: string | null;
  totalCents: number;
  currency: string;
  customerEmail: string | null;
  itemCount: number;
  trackingNumber: string | null;
  aliexpressOrderId: string | null;
  hasStockShortfall: boolean;
}

/**
 * Real orders, newest first. Everything a customer buys through Stripe checkout lands here as
 * PENDING_PAYMENT and becomes PAID only when Stripe's webhook confirms the money moved, so this
 * list is also how you spot payments that started but never completed.
 */
export async function getAdminOrders(limit = 200): Promise<AdminOrderSummary[]> {
  const tenantId = await getTenantId();
  const supabase = db();

  const { data, error } = await supabase
    .from("orders")
    .select("id, created_at, status, fulfillment_status, total, currency, customer_id, tracking_number, aliexpress_order_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load orders: ${error.message}`);

  interface OrderRow {
    id: string;
    created_at: string;
    status: string;
    fulfillment_status: string | null;
    total: number;
    currency: string;
    customer_id: string | null;
    tracking_number: string | null;
    aliexpress_order_id: string | null;
  }
  const rows = (data ?? []) as OrderRow[];
  if (rows.length === 0) return [];

  const orderIds = rows.map((r) => r.id);
  const customerIds = [...new Set(rows.map((r) => r.customer_id).filter((id): id is string => Boolean(id)))];

  const [{ data: itemRows }, { data: customerRows }, { data: shortfallRows }] = await Promise.all([
    supabase.from("order_items").select("order_id, quantity").in("order_id", orderIds),
    customerIds.length > 0
      ? supabase.from("customers").select("id, email").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; email: string }[] }),
    supabase.from("fulfillment_logs").select("order_id").eq("event", "stock_shortfall").in("order_id", orderIds),
  ]);

  const itemsByOrder = new Map<string, number>();
  for (const item of ((itemRows ?? []) as { order_id: string; quantity: number }[])) {
    itemsByOrder.set(item.order_id, (itemsByOrder.get(item.order_id) ?? 0) + item.quantity);
  }
  const emailByCustomer = new Map(((customerRows ?? []) as { id: string; email: string }[]).map((c) => [c.id, c.email]));
  const shortfallOrderIds = new Set(((shortfallRows ?? []) as { order_id: string }[]).map((r) => r.order_id));

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    status: r.status,
    fulfillmentStatus: r.fulfillment_status,
    totalCents: r.total,
    currency: r.currency,
    customerEmail: r.customer_id ? (emailByCustomer.get(r.customer_id) ?? null) : null,
    itemCount: itemsByOrder.get(r.id) ?? 0,
    trackingNumber: r.tracking_number,
    aliexpressOrderId: r.aliexpress_order_id,
    hasStockShortfall: shortfallOrderIds.has(r.id),
  }));
}
