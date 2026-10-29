import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";

export const runtime = "nodejs";
// Never prerender or cache an admin endpoint (see the other admin routes).
export const dynamic = "force-dynamic";

/**
 * The store's public contact details. The policy pages print them, and the support form emails
 * new messages to contact_email — but no screen could set them, so both fell back to nothing.
 */
export async function GET() {
  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase);
  const { data, error } = await supabase.from("tenant_settings").select("contact_email, contact_phone, contact_address").eq("tenant_id", tenantId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    contactEmail: data?.contact_email ?? "",
    contactPhone: data?.contact_phone ?? "",
    contactAddress: data?.contact_address ?? "",
  });
}

const optional = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const bodySchema = z.object({
  contactEmail: z.union([z.literal(""), z.string().trim().email()]).transform((v) => (v === "" ? null : v)),
  contactPhone: optional(40),
  contactAddress: optional(300),
});

export async function PUT(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the email address — it doesn't look valid." }, { status: 400 });

  const supabase = createServiceRoleSupabaseClient();
  const tenantId = await resolveTenantId(supabase);
  const patch = { contact_email: parsed.data.contactEmail, contact_phone: parsed.data.contactPhone, contact_address: parsed.data.contactAddress };

  const { data: updated, error } = await supabase.from("tenant_settings").update(patch).eq("tenant_id", tenantId).select("tenant_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    const { data: tenant } = await supabase.from("tenants").select("name").eq("id", tenantId).single();
    const { error: insertError } = await supabase.from("tenant_settings").insert({ tenant_id: tenantId, brand_name: tenant?.name ?? "Store", ...patch });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
