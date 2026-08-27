import { ConsoleEmailProvider, pollTrackingUpdates } from "@trend/core";
import type { TrackingSyncSummary } from "@trend/core";
import { getAliExpressClient, getDb, listTenantIds } from "../lib/env";

const emailProvider = new ConsoleEmailProvider();

/** Polls every in-flight AliExpress order for every tenant and sends a shipping-confirmation email on the first shipped transition. Runs every 4-6 hours — see queue.ts. */
export async function runTrackingSyncForAllTenants(): Promise<TrackingSyncSummary[]> {
  const db = getDb();
  const client = getAliExpressClient();
  const tenantIds = await listTenantIds(db);

  const summaries: TrackingSyncSummary[] = [];
  for (const tenantId of tenantIds) {
    const summary = await pollTrackingUpdates(db, client, { tenantId }, async (event) => {
      const { data: order } = await db
        .from("orders")
        .select("id, customers(email)")
        .eq("id", event.orderId)
        .single();
      const customerEmail = (order as any)?.customers?.email;
      if (!customerEmail) {
        console.warn(`[tracking-sync] order ${event.orderId} shipped but has no customer email on file — skipping notification`);
        return;
      }
      await emailProvider.sendTransactionalEmail({
        to: customerEmail,
        templateKey: "order-shipped",
        subject: "Your Beach Footprints order has shipped",
        data: { orderId: event.orderId, trackingNumber: event.trackingNumber, carrier: event.carrier, trackingUrl: event.trackingUrl },
      });
    });
    summaries.push(summary);
    console.log(
      `[tracking-sync] tenant=${tenantId} polled=${summary.polled} shipped=${summary.shipped} delivered=${summary.delivered} errors=${summary.errors.length}`,
    );
  }
  return summaries;
}
