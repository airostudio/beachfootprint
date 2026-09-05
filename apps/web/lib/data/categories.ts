import "server-only";
import { db, getTenantId } from "./client";
import type { Category } from "../types";

interface CategoryRow {
  id: string;
  parent_id: string | null;
  name: string;
  handle: string;
  description: string | null;
  hero_image_url: string | null;
}

function rowToCategory(row: CategoryRow, handleById: Map<string, string>): Category {
  return {
    id: row.id,
    handle: row.handle,
    name: row.name,
    description: row.description ?? undefined,
    heroImageUrl: row.hero_image_url ?? undefined,
    parentHandle: row.parent_id ? handleById.get(row.parent_id) : undefined,
  };
}

export async function getCategories(): Promise<Category[]> {
  const tenantId = await getTenantId();
  const { data, error } = await db()
    .from("categories")
    .select("id, parent_id, name, handle, description, hero_image_url")
    .eq("tenant_id", tenantId)
    .eq("is_hidden", false)
    .order("position");
  if (error) throw new Error(`Could not load categories: ${error.message}`);

  const rows = (data ?? []) as CategoryRow[];
  const handleById = new Map(rows.map((r) => [r.id, r.handle]));
  return rows.map((r) => rowToCategory(r, handleById));
}

export async function getCategoryTree() {
  const categories = await getCategories();
  const top = categories.filter((c) => !c.parentHandle);
  return top.map((c) => ({ ...c, children: categories.filter((s) => s.parentHandle === c.handle) }));
}

export async function getCategoryByHandle(handle: string): Promise<Category | undefined> {
  const categories = await getCategories();
  return categories.find((c) => c.handle === handle);
}

export interface FeatureCategory extends Category {
  /** The newest published product's main image, falling back to the category's own hero image. */
  imageUrl?: string;
  productCount: number;
}

/**
 * Categories for the home page, built from what's actually in the database rather than a
 * hardcoded list — so adding a category (or the first product in one) shows up on the front page
 * with no code change.
 *
 * Each card's image is the main image of the newest published product in that category, which
 * keeps the front page reflecting current stock instead of a fixed hero shot. Categories with no
 * published products are left out: an empty card that leads to an empty listing is worse than not
 * showing the category yet.
 */
export async function getFeatureCategories(limit = 6): Promise<FeatureCategory[]> {
  const tenantId = await getTenantId();
  const supabase = db();
  const categories = await getCategories();
  if (categories.length === 0) return [];

  const idByHandle = new Map(categories.map((c) => [c.handle, c.id]));
  const categoryIds = [...idByHandle.values()];

  // Published products per category, newest first, so the first one seen for a category is the
  // one whose image the card should use.
  const { data: links } = await supabase
    .from("product_categories")
    .select("category_id, products!inner(id, created_at, status, tenant_id)")
    .in("category_id", categoryIds)
    .eq("products.tenant_id", tenantId)
    .eq("products.status", "PUBLISHED");

  interface LinkRow {
    category_id: string;
    products: { id: string; created_at: string } | { id: string; created_at: string }[];
  }
  const newestByCategory = new Map<string, { id: string; created_at: string }>();
  const countByCategory = new Map<string, number>();
  for (const link of (links ?? []) as unknown as LinkRow[]) {
    const product = Array.isArray(link.products) ? link.products[0] : link.products;
    if (!product) continue;
    countByCategory.set(link.category_id, (countByCategory.get(link.category_id) ?? 0) + 1);
    const current = newestByCategory.get(link.category_id);
    if (!current || product.created_at > current.created_at) newestByCategory.set(link.category_id, product);
  }

  const newestProductIds = [...newestByCategory.values()].map((p) => p.id);
  const imageByProduct = new Map<string, string>();
  if (newestProductIds.length > 0) {
    const { data: media } = await supabase
      .from("product_media")
      .select("product_id, url, position")
      .in("product_id", newestProductIds)
      .order("position");
    for (const row of (media ?? []) as { product_id: string; url: string }[]) {
      if (!imageByProduct.has(row.product_id)) imageByProduct.set(row.product_id, row.url);
    }
  }

  return categories
    .filter((c) => (countByCategory.get(c.id) ?? 0) > 0)
    .map((c) => {
      const newest = newestByCategory.get(c.id);
      return {
        ...c,
        imageUrl: (newest ? imageByProduct.get(newest.id) : undefined) ?? c.heroImageUrl,
        productCount: countByCategory.get(c.id) ?? 0,
      };
    })
    .slice(0, limit);
}
