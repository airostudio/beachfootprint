import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";
import { listStagedProducts } from "@/lib/import/staging";

export const runtime = "nodejs";

/** The review queue: everything staged and not yet committed to the store. */
export async function GET(request: Request) {
  const tenantParam = new URL(request.url).searchParams.get("tenant") ?? undefined;
  try {
    const supabase = createServiceRoleSupabaseClient();
    const tenantId = await resolveTenantId(supabase, tenantParam);
    return NextResponse.json({ staged: await listStagedProducts(supabase, tenantId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load the staging queue";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
