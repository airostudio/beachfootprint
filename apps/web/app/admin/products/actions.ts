"use server";

import { revalidatePath } from "next/cache";
import { db, getTenantId } from "@/lib/data/client";
import { DEMO_PRODUCT_HANDLES } from "@/lib/data/demoProducts";
import { NEW_ARRIVALS_HANDLE, newArrivalsCutoffIso } from "@/lib/newArrivals";

export async function publishProduct(productId: string): Promise<void> {
  const tenantId = await getTenantId();
  const { error } = await db().from("products").update({ status: "PUBLISHED" }).eq("id", productId).eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not publish product: ${error.message}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/shop");
  revalidatePath("/");
}

/**
 * Housekeeping for New Arrivals: drops the category link from every product older than
 * NEW_ARRIVALS_DAYS, so the stored categories match what the storefront shows.
 *
 * Nothing depends on this having run — the New Arrivals listing applies the same cutoff when it
 * reads (see lib/newArrivals.ts), so a product ages out on time whether or not this is ever
 * called. This just stops the link table accumulating memberships that no longer mean anything.
 */
export async function sweepNewArrivals(): Promise<void> {
  const tenantId = await getTenantId();
  const supabase = db();

  const { data: category } = await supabase
    .from("categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("handle", NEW_ARRIVALS_HANDLE)
    .maybeSingle();
  const categoryId = category?.id as string | undefined;
  if (!categoryId) return;

  const { data: expired, error: expiredError } = await supabase
    .from("products")
    .select("id")
    .eq("tenant_id", tenantId)
    .lt("created_at", newArrivalsCutoffIso());
  if (expiredError) throw new Error(`Could not find expired new arrivals: ${expiredError.message}`);

  const ids = ((expired ?? []) as { id: string }[]).map((p) => p.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("category_id", categoryId)
      .in("product_id", ids.slice(i, i + 200));
    if (error) throw new Error(`Could not clear expired new arrivals: ${error.message}`);
  }

  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/");
}

/**
 * Deletes the eight placeholder products supabase/seed.sql creates, for admins who never ran
 * migrations/0004_remove_demo_seed_products.sql by hand (which is most of them — it's a SQL file
 * you have to know exists). Matched by exact seeded handle, so a real product can't be caught by
 * it; variants, media, category links and inventory go with them via `on delete cascade`.
 */
export async function removeDemoProducts(): Promise<void> {
  const tenantId = await getTenantId();
  const { error } = await db()
    .from("products")
    .delete()
    .eq("tenant_id", tenantId)
    .in("handle", DEMO_PRODUCT_HANDLES as unknown as string[]);
  if (error) throw new Error(`Could not remove the demo products: ${error.message}`);

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/shop");
  revalidatePath("/");
}

/**
 * Relabels every variant in the catalogue to one currency code.
 *
 * This RELABELS, it does not convert: there is no FX rate here, so a variant priced 2000 (i.e.
 * A$20.00) becomes US$20.00, not its dollar equivalent. That is deliberate — silently applying an
 * invented rate to real prices would be worse than making the admin re-price. Use it to make a
 * catalogue single-currency (checkout refuses a cart mixing currencies), then adjust the amounts.
 */
export async function setCatalogueCurrency(formData: FormData): Promise<void> {
  const currency = String(formData.get("currency") ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`"${currency}" is not a 3-letter currency code`);

  const tenantId = await getTenantId();
  const supabase = db();

  const { data: products, error: productsError } = await supabase.from("products").select("id").eq("tenant_id", tenantId);
  if (productsError) throw new Error(`Could not load products: ${productsError.message}`);
  const productIds = ((products ?? []) as { id: string }[]).map((p) => p.id);
  if (productIds.length === 0) return;

  // Chunked because `.in()` becomes a query-string filter — a few thousand ids in one call would
  // blow past the URL length PostgREST accepts.
  for (let i = 0; i < productIds.length; i += 200) {
    const { error } = await supabase
      .from("product_variants")
      .update({ currency })
      .in("product_id", productIds.slice(i, i + 200));
    if (error) throw new Error(`Could not set catalogue currency: ${error.message}`);
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/shop");
  revalidatePath("/");
}

/** Publishes every DRAFT product for the tenant in one go — e.g. right after a WooCommerce import, which lands everything as DRAFT for review. */
export async function publishAllDrafts(): Promise<void> {
  const tenantId = await getTenantId();
  const { error } = await db().from("products").update({ status: "PUBLISHED" }).eq("tenant_id", tenantId).eq("status", "DRAFT");
  if (error) throw new Error(`Could not publish draft products: ${error.message}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/shop");
  revalidatePath("/");
}
