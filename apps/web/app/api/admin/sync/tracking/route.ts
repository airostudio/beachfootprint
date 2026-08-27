import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { AliExpressClient, ConsoleEmailProvider, pollTrackingUpdates } from "@trend/core";
import { resolveTenantId } from "@/lib/import/tenant";

export const runtime = "nodejs";

const bodySchema = z.object({
  tenant: z.string().optional(),
});

/** Manually triggers a tracking poll for every in-flight AliExpress order — the same work the every-4-6-hours background job does, exposed for on-demand/admin-triggered use. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase, parsed.data.tenant);
  const emailProvider = new ConsoleEmailProvider();

  try {
    const client = AliExpressClient.fromEnv();
    const summary = await pollTrackingUpdates(supabase, client, { tenantId }, async (event) => {
      const { data: order } = await supabase.from("orders").select("id, customers(email)").eq("id", event.orderId).single();
      const customerEmail = (order as any)?.customers?.email;
      if (!customerEmail) return;
      await emailProvider.sendTransactionalEmail({
        to: customerEmail,
        templateKey: "order-shipped",
        subject: "Your Beach Footprints order has shipped",
        data: { orderId: event.orderId, trackingNumber: event.trackingNumber, carrier: event.carrier, trackingUrl: event.trackingUrl },
      });
    });
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress tracking sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
