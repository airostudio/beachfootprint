import { NextResponse } from "next/server";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";

export const runtime = "nodejs";
// Never prerender or cache an admin endpoint: Next will happily statically optimise a
// route whose GET succeeds at build time, after which every other method on it returns a
// bodiless 405 and the GET serves a stale build-time snapshot.
export const dynamic = "force-dynamic";

/**
 * Confirms the review belongs to this tenant before it's touched.
 *
 * `reviews` has no tenant_id of its own — it only reaches a tenant through its product — so
 * without this check any caller who can reach this route (which every admin API route can be,
 * since the only gate is a single shared admin password, not per-tenant sessions) could approve
 * or delete another tenant's review just by knowing or guessing its id.
 */
async function reviewBelongsToTenant(supabase: ReturnType<typeof createServiceRoleSupabaseClient>, id: string, tenantId: string): Promise<boolean> {
  const { data } = await supabase.from("reviews").select("id, products!inner(tenant_id)").eq("id", id).eq("products.tenant_id", tenantId).maybeSingle();
  return Boolean(data);
}

/** Approves a pending review, making it visible on the product page. */
export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase);
  if (!(await reviewBelongsToTenant(supabase, params.id, tenantId))) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const { data, error } = await supabase.from("reviews").update({ is_approved: true }).eq("id", params.id).select("id").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Review not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Rejects (deletes) a pending review — there is no "rejected but kept" state, just gone. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase);
  if (!(await reviewBelongsToTenant(supabase, params.id, tenantId))) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const { error } = await supabase.from("reviews").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
