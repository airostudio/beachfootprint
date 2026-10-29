import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceRoleSupabaseClient } from "@trend/db";
import { resolveTenantId } from "@/lib/import/tenant";
import { isDisplayableImageUrl } from "@/lib/import/imageUrls";

export const runtime = "nodejs";
// Never prerender or cache an admin endpoint: Next will happily statically optimise a
// route whose GET succeeds at build time, after which every other method on it returns a
// bodiless 405 and the GET serves a stale build-time snapshot.
export const dynamic = "force-dynamic";

/** Everything the admin editor can change on a live product. */
const patchSchema = z.object({
  title: z.string().min(1).optional(),
  // Normalised the same way imports create handles, so a typed "My Bag " can't become a URL with
  // spaces or capitals in it.
  handle: z
    .string()
    .transform((v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80))
    .refine((v) => v.length > 0, "Handle needs at least one letter or number")
    .optional(),
  shortDescription: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  seoTitle: z.string().nullable().optional(),
  seoDesc: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED", "OUT_OF_STOCK"]).optional(),
  productType: z.enum(["STANDARD", "ACCESSORY", "CARE_PRODUCT", "BUNDLE", "GIFT_CARD"]).optional(),
  brand: z.string().nullable().optional(),
  shippingClass: z.enum(["STANDARD", "HEAVY", "OVERSIZED", "FREIGHT", "SPECIAL"]).optional(),
  stockPolicy: z.enum(["IN_STOCK", "MADE_TO_ORDER", "PREORDER", "BACKORDER", "DISCONTINUED"]).optional(),
  packagedWeightGrams: z.number().int().min(0).nullable().optional(),
  careInstructions: z.string().nullable().optional(),
  isIndexable: z.boolean().optional(),
  categoryIds: z.array(z.string().uuid()).optional(),
  media: z.array(z.object({ url: z.string().min(1), alt: z.string().nullable().optional() })).optional(),
  specs: z.array(z.object({ group: z.string().min(1), label: z.string().min(1), value: z.string() })).optional(),
  variants: z
    .array(
      z.object({
        id: z.string().uuid(),
        priceCents: z.number().int().min(0),
        compareAtCents: z.number().int().min(0).nullable(),
        sku: z.string().nullable(),
        option1Name: z.string().nullable(),
        option1Value: z.string().nullable(),
        option2Name: z.string().nullable(),
        option2Value: z.string().nullable(),
        option3Name: z.string().nullable(),
        option3Value: z.string().nullable(),
        stockOnHand: z.number().int().min(0),
        isActive: z.boolean(),
        // ISO 4217. Changing this RELABELS the price, it does not convert it — there is no FX
        // rate here, and silently converting money would be worse than not offering it.
        currency: z.string().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code").optional(),
      }),
    )
    .optional(),
});

const PRODUCT_COLUMN: Record<string, string> = {
  title: "title",
  handle: "handle",
  shortDescription: "short_description",
  description: "description",
  seoTitle: "seo_title",
  seoDesc: "seo_desc",
  status: "status",
  productType: "product_type",
  brand: "brand",
  shippingClass: "shipping_class",
  stockPolicy: "stock_policy",
  packagedWeightGrams: "packaged_weight_grams",
  careInstructions: "care_instructions",
  isIndexable: "is_indexable",
};

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const tenantId = await resolveTenantId(supabase);

    const { data: product, error } = await supabase
      .from("products")
      .select(
        "id, title, handle, short_description, description, seo_title, seo_desc, status, product_type, brand, " +
          "shipping_class, stock_policy, packaged_weight_grams, care_instructions, is_indexable",
      )
      .eq("id", params.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const [{ data: variants }, { data: media }, { data: specs }, { data: catLinks }] = await Promise.all([
      supabase
        .from("product_variants")
        .select("id, title, sku, price, compare_at, currency, is_active, supplier, supplier_sku_id, cost, option1_name, option1_value, option2_name, option2_value, option3_name, option3_value")
        .eq("product_id", params.id)
        .order("price"),
      supabase.from("product_media").select("url, alt, position").eq("product_id", params.id).order("position"),
      supabase.from("product_specs").select("group, label, value, position").eq("product_id", params.id).order("position"),
      supabase.from("product_categories").select("category_id").eq("product_id", params.id),
    ]);

    const variantIds = ((variants ?? []) as { id: string }[]).map((v) => v.id);
    const { data: stock } = variantIds.length
      ? await supabase.from("inventory_items").select("variant_id, stock_on_hand").in("variant_id", variantIds)
      : { data: [] as { variant_id: string; stock_on_hand: number }[] };
    const stockByVariant = new Map(((stock ?? []) as { variant_id: string; stock_on_hand: number }[]).map((r) => [r.variant_id, r.stock_on_hand]));

    return NextResponse.json({
      product,
      variants: ((variants ?? []) as Record<string, unknown>[]).map((v) => ({
        ...v,
        stock_on_hand: stockByVariant.get(v.id as string) ?? 0,
      })),
      media: media ?? [],
      specs: specs ?? [],
      categoryIds: ((catLinks ?? []) as { category_id: string }[]).map((c) => c.category_id),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load product" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const supabase = createServiceRoleSupabaseClient();
    const tenantId = await resolveTenantId(supabase);

    const { data: owned } = await supabase.from("products").select("id").eq("id", params.id).eq("tenant_id", tenantId).maybeSingle();
    if (!owned) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(parsed.data)) {
      if (PRODUCT_COLUMN[field]) updates[PRODUCT_COLUMN[field]] = value;
    }
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from("products").update(updates).eq("id", params.id);
      if (error) {
        const message = error.code === "23505" ? "Another product already uses that handle" : error.message;
        return NextResponse.json({ error: message }, { status: 409 });
      }
    }

    // Variants are updated in place; this editor never creates or deletes them, because a
    // dropshipped variant is mapped to an AliExpress SKU and losing that mapping breaks sync.
    for (const v of parsed.data.variants ?? []) {
      const { data, error } = await supabase
        .from("product_variants")
        .update({
          price: v.priceCents,
          compare_at: v.compareAtCents,
          sku: v.sku,
          ...(v.currency ? { currency: v.currency } : {}),
          option1_name: v.option1Name,
          option1_value: v.option1Value,
          option2_name: v.option2Name,
          option2_value: v.option2Value,
          option3_name: v.option3Name,
          option3_value: v.option3Value,
          is_active: v.isActive,
        })
        .eq("id", v.id)
        .eq("product_id", params.id)
        .select("id");
      if (error) throw new Error(`Could not update variant: ${error.message}`);
      // The stock write below is keyed only by variant id. Without this check, a variant id that
      // isn't this product's (another product's, or another store's) matched nothing above and
      // then had its stock overwritten anyway.
      if (!data || data.length === 0) throw new Error(`Variant ${v.id} does not belong to this product`);
      const { error: stockError } = await supabase
        .from("inventory_items")
        .upsert({ variant_id: v.id, stock_on_hand: v.stockOnHand }, { onConflict: "variant_id" });
      if (stockError) throw new Error(`Could not update stock: ${stockError.message}`);
    }

    // Media, specs and categories are replaced as sets. The new rows go in first and the old ones
    // are removed after, by id: the old delete-then-insert had no transaction around it, so a
    // failed insert left the product with no images (or specs, or categories) at all.
    if (parsed.data.media) {
      // An image the storefront can't display (http, protocol-relative) breaks the gallery with
      // an optimiser 400 — refused here rather than saved.
      const bad = parsed.data.media.find((m) => !isDisplayableImageUrl(m.url));
      if (bad) return NextResponse.json({ error: `Image URL must start with https:// — "${bad.url}" can't be shown on the storefront.` }, { status: 400 });
      await replaceSet(supabase, "product_media", params.id, parsed.data.media.map((m, position) => ({ product_id: params.id, url: m.url, alt: m.alt ?? null, position })), "images");
    }

    if (parsed.data.specs) {
      await replaceSet(supabase, "product_specs", params.id, parsed.data.specs.map((s, position) => ({ product_id: params.id, group: s.group, label: s.label, value: s.value, position })), "specifications");
    }

    if (parsed.data.categoryIds) {
      // Only this store's categories can be linked — the ids come from the request.
      const wanted = [...new Set(parsed.data.categoryIds)];
      if (wanted.length > 0) {
        const { data: valid } = await supabase.from("categories").select("id").eq("tenant_id", tenantId).in("id", wanted);
        if ((valid ?? []).length !== wanted.length) return NextResponse.json({ error: "One of those categories doesn't exist in this store" }, { status: 400 });
        const { error: linkError } = await supabase
          .from("product_categories")
          .upsert(wanted.map((category_id) => ({ product_id: params.id, category_id })), { onConflict: "product_id,category_id" });
        if (linkError) throw new Error(`Could not set categories: ${linkError.message}`);
      }
      let clear = supabase.from("product_categories").delete().eq("product_id", params.id);
      if (wanted.length > 0) clear = clear.not("category_id", "in", `(${wanted.join(",")})`);
      const { error: clearError } = await clear;
      if (clearError) throw new Error(`Could not update categories: ${clearError.message}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save product" }, { status: 500 });
  }
}

async function replaceSet(
  supabase: ReturnType<typeof createServiceRoleSupabaseClient>,
  table: "product_media" | "product_specs",
  productId: string,
  rows: Record<string, unknown>[],
  label: string,
): Promise<void> {
  const { data: old, error: readError } = await supabase.from(table).select("id").eq("product_id", productId);
  if (readError) throw new Error(`Could not read existing ${label}: ${readError.message}`);
  if (rows.length > 0) {
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw new Error(`Could not save ${label}: ${error.message}`);
  }
  const oldIds = ((old ?? []) as { id: string }[]).map((r) => r.id);
  if (oldIds.length > 0) {
    const { error } = await supabase.from(table).delete().in("id", oldIds);
    if (error) throw new Error(`Saved new ${label} but could not remove the old ones: ${error.message}`);
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServiceRoleSupabaseClient();
    const tenantId = await resolveTenantId(supabase);
    const { error } = await supabase.from("products").delete().eq("id", params.id).eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete product" }, { status: 500 });
  }
}
