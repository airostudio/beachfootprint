import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";
import { categorizeProduct } from "@/lib/import/categorize";
import { importProduct } from "@/lib/dropshipEngine";

export const runtime = "nodejs";

const bodySchema = z.object({ productId: z.string().min(1), tenant: z.string().optional() });

/**
 * Stages an AliExpress product for review — fetches it via the engine (which applies this
 * store's pricing rule and, when ANTHROPIC_API_KEY is set, AI-rewrites the title/description),
 * suggests a category, and returns everything for the admin to review. Writes NOTHING to this
 * store's database — a product only actually lands here once POST .../confirm is called with
 * (optionally edited) data from this response. This is the gate the user asked for: nothing
 * reaches the store until copy + category have been worked out.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase, parsed.data.tenant);

  try {
    const imported = await importProduct({ aliexpressProductId: parsed.data.productId });
    const category = await categorizeProduct(supabase, tenantId, { title: imported.onBrandName, description: imported.description });

    return NextResponse.json({
      ...imported,
      suggestedCategoryId: category?.categoryId ?? null,
      suggestedCategoryHandle: category?.categoryHandle ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AliExpress preview failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
