import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";
import { stageProduct } from "@/lib/import/staging";

export const runtime = "nodejs";
// Never prerender or cache an admin endpoint: Next will happily statically optimise a
// route whose GET succeeds at build time, after which every other method on it returns a
// bodiless 405 and the GET serves a stale build-time snapshot.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  productId: z.string().min(1),
  sourceUrl: z.string().optional(),
  tenant: z.string().optional(),
});

/**
 * Stages ONE product into the review queue. Bulk pasting is driven from the client, one request
 * per line, so a batch of twenty never has to finish inside a single function invocation and the
 * admin sees per-line progress (and per-line failures) as it goes.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase, parsed.data.tenant);

  try {
    const staged = await stageProduct(supabase, tenantId, {
      aliexpressProductId: parsed.data.productId,
      sourceUrl: parsed.data.sourceUrl ?? null,
    });
    return NextResponse.json(staged);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not stage this product";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
