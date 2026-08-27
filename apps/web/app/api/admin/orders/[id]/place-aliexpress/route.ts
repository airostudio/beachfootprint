import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { AliExpressClient, placeAliExpressOrder } from "@trend/core";

export const runtime = "nodejs";

const bodySchema = z.object({
  logisticsServiceName: z.string().optional(),
});

/** Places the AliExpress dropshipping order for a paid local order. Idempotent — a second call for an already-placed order is a no-op (see placeAliExpressOrder's atomic claim). */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();

  try {
    const client = AliExpressClient.fromEnv();
    const result = await placeAliExpressOrder(supabase, client, {
      orderId: params.id,
      logisticsServiceName: parsed.data.logisticsServiceName,
    });
    return NextResponse.json(result, { status: result.skipped ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress order placement failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
