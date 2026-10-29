import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export function slugifyHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

/**
 * Categories are two-tier (e.g. Adult Toys → Vibrators), and the storefront is built for exactly
 * that: the nav renders one dropdown level and a parent page rolls up its direct children only.
 * Enforcing it here also rules out cycles (A → B → A), which made both categories vanish from
 * the tree entirely.
 *
 * Returns an error message, or null if `parentId` is an acceptable parent for `categoryId`.
 */
export async function checkCategoryParent(
  supabase: SupabaseClient,
  tenantId: string,
  parentId: string,
  categoryId?: string,
): Promise<string | null> {
  if (categoryId && parentId === categoryId) return "A category can't be its own parent";

  const { data: parent } = await supabase.from("categories").select("id, parent_id").eq("id", parentId).eq("tenant_id", tenantId).maybeSingle();
  if (!parent) return "That parent category doesn't exist in this store";
  if (parent.parent_id) return "Subcategories can't have subcategories of their own — pick a top-level category as the parent";

  if (categoryId) {
    const { count } = await supabase.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", categoryId);
    if ((count ?? 0) > 0) return "This category has its own subcategories, so it can't be moved under another category";
  }
  return null;
}
