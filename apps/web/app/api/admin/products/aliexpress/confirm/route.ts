import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";
import { commitAliExpressImport } from "@/lib/import/commitAliExpressImport";
import type { ImportProductResult } from "@/lib/dropshipEngine";

export const runtime = "nodejs";

// Mirrors ImportProductResult's shape loosely — this is the already-staged data the
// admin reviewed (and could have hand-edited) on the preview response, sent back as-is.
const importedSchema = z.object({
  aliexpressProductId: z.string(),
  onBrandName: z.string(),
  description: z.string(),
  currencyCode: z.string(),
  imageUrls: z.array(z.string()),
  skus: z.array(
    z.object({
      aliexpressSkuId: z.string(),
      properties: z.string().nullable(),
      retailPriceCents: z.number(),
      supplierCostCents: z.number(),
      marginRate: z.number(),
      stockOnHand: z.number(),
    }),
  ),
});

const bodySchema = z.object({
  imported: importedSchema,
  tenant: z.string().optional(),
  publish: z.boolean().optional(),
  categoryId: z.string().nullable().optional(),
});

/**
 * Commits one already-staged (previewed + AI-rewritten) AliExpress product into the store.
 * This is the confirm gate: nothing reaches products/product_variants until an admin has
 * reviewed the staged copy and category here and explicitly confirmed it — no re-fetch, no
 * second AI call, just writes what was already staged (with any category override applied).
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase, parsed.data.tenant);

  try {
    const result = await commitAliExpressImport(supabase, {
      tenantId,
      imported: parsed.data.imported as ImportProductResult,
      publish: parsed.data.publish,
      categoryId: parsed.data.categoryId ?? null,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress confirm failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
