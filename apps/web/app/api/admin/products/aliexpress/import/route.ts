import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { AliExpressClient, importProductFromAliExpress } from "@trend/core";
import { resolveTenantId } from "@/lib/import/tenant";

export const runtime = "nodejs";

const bodySchema = z.object({
  productId: z.string().min(1),
  tenant: z.string().optional(),
  marginRate: z.number().min(0).optional(),
  publish: z.boolean().optional(),
});

/** Imports a single AliExpress product: fetches live detail, applies the 35%-margin pricing + boho surf copy rewrite, and upserts it as a Beach Footprints product. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase, parsed.data.tenant);

  try {
    const client = AliExpressClient.fromEnv();
    const result = await importProductFromAliExpress(supabase, client, {
      tenantId,
      aliexpressProductId: parsed.data.productId,
      marginRate: parsed.data.marginRate,
      publishNewProducts: parsed.data.publish,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress import failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
