import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";
import { commitAliExpressImport } from "@/lib/import/commitAliExpressImport";
import { getStagedProduct } from "@/lib/import/staging";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  stagedIds: z.array(z.string().uuid()).min(1).max(25),
  tenant: z.string().optional(),
});

interface ConfirmOutcome {
  stagedId: string;
  ok: boolean;
  handle?: string;
  productId?: string;
  isNewProduct?: boolean;
  /** DRAFT products are real products but deliberately invisible on the storefront until published. */
  status?: "DRAFT" | "PUBLISHED";
  error?: string;
}

/**
 * Commits reviewed staged products into the store. This is the gate: a product only becomes real
 * here, using the copy/pricing/category as the admin last edited it. Each id is committed
 * independently so one bad row can't roll back the rest of a bulk confirmation — the response says
 * exactly which succeeded and which didn't.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase, parsed.data.tenant);

  const results: ConfirmOutcome[] = [];
  for (const stagedId of parsed.data.stagedIds) {
    try {
      const staged = await getStagedProduct(supabase, tenantId, stagedId);
      if (!staged) {
        results.push({ stagedId, ok: false, error: "Staged product not found" });
        continue;
      }
      if (staged.status === "failed") {
        results.push({ stagedId, ok: false, error: staged.error ?? "This product failed to import and can't be confirmed" });
        continue;
      }

      const committed = await commitAliExpressImport(supabase, { tenantId, staged });

      await supabase
        .from("aliexpress_staged_products")
        .update({ status: "confirmed", confirmed_product_id: committed.productId, confirmed_at: new Date().toISOString() })
        .eq("id", stagedId)
        .eq("tenant_id", tenantId);

      // Logged so a "it said confirmed but I can't find it" report can be traced from the
      // runtime logs alone — response bodies aren't recorded there.
      console.log(
        `[aliexpress/confirm] committed staged=${stagedId} product=${committed.productId} handle=${committed.handle} ` +
          `new=${committed.isNewProduct} status=${staged.publish ? "PUBLISHED" : "DRAFT"} tenant=${tenantId} variants=${committed.variantIds.length}`,
      );

      results.push({
        stagedId,
        ok: true,
        handle: committed.handle,
        productId: committed.productId,
        isNewProduct: committed.isNewProduct,
        status: staged.publish ? "PUBLISHED" : "DRAFT",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not add this product to the store";
      console.error(`[aliexpress/confirm] FAILED staged=${stagedId} tenant=${tenantId}: ${message}`);
      results.push({ stagedId, ok: false, error: message });
    }
  }

  return NextResponse.json({ results, confirmed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length });
}
