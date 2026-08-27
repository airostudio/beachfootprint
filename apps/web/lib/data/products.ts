import "server-only";
import { db, getTenantId } from "./client";
import type { ProductDetail, ProductSpecGroup, ProductSummary, ProductType } from "../types";
import { getDollConfiguratorForProduct } from "./dolls";

const PRODUCT_TYPE_MAP: Record<string, ProductType> = {
  STANDARD: "standard",
  CONFIGURABLE: "configurable",
  SILICONE_DOLL: "silicone_doll",
  ADULT_PRODUCT: "adult_product",
  ACCESSORY: "accessory",
  CARE_PRODUCT: "care_product",
  REPLACEMENT_PART: "replacement_part",
  BUNDLE: "bundle",
  GIFT_CARD: "bundle", // no dedicated storefront treatment yet — renders like a bundle
};

interface ProductRow {
  id: string;
  handle: string;
  title: string;
  product_type: string;
  short_description: string | null;
  description: string | null;
  stock_policy: string;
  care_instructions: string | null;
  warranty_details: string | null;
  warranty_months: number | null;
  production_days: number | null;
  dispatch_days: number | null;
  is_indexable: boolean;
}

const PRODUCT_COLUMNS =
  "id, handle, title, product_type, short_description, description, stock_policy, care_instructions, warranty_details, warranty_months, production_days, dispatch_days, is_indexable";

interface Hydrated {
  variantByProduct: Map<string, { priceCents: number; compareAtCents?: number; currency: string }>;
  mediaByProduct: Map<string, { url: string; alt: string | null }[]>;
  categoryHandlesByProduct: Map<string, string[]>;
  dollProductIds: Set<string>;
  stockOnHandByProduct: Map<string, number>;
  ratingByProduct: Map<string, { avg: number; count: number }>;
}

async function hydrate(productIds: string[]): Promise<Hydrated> {
  const empty: Hydrated = {
    variantByProduct: new Map(),
    mediaByProduct: new Map(),
    categoryHandlesByProduct: new Map(),
    dollProductIds: new Set(),
    stockOnHandByProduct: new Map(),
    ratingByProduct: new Map(),
  };
  if (productIds.length === 0) return empty;

  const supabase = db();
  const [variantsRes, mediaRes, catLinksRes, dollModelsRes, reviewsRes] = await Promise.all([
    supabase.from("product_variants").select("id, product_id, price, compare_at, currency, is_active").in("product_id", productIds),
    supabase.from("product_media").select("product_id, url, alt, position").in("product_id", productIds).order("position"),
    supabase.from("product_categories").select("product_id, categories(handle)").in("product_id", productIds),
    supabase.from("doll_models").select("product_id").in("product_id", productIds),
    supabase.from("reviews").select("product_id, rating").in("product_id", productIds).eq("is_approved", true),
  ]);

  const variantRows = (variantsRes.data ?? []) as { id: string; product_id: string; price: number; compare_at: number | null; currency: string; is_active: boolean }[];
  for (const productId of productIds) {
    const candidates = variantRows.filter((v) => v.product_id === productId && v.is_active);
    const pool = candidates.length > 0 ? candidates : variantRows.filter((v) => v.product_id === productId);
    if (pool.length === 0) continue;
    const cheapest = pool.reduce((min, v) => (v.price < min.price ? v : min), pool[0]);
    empty.variantByProduct.set(productId, {
      priceCents: cheapest.price,
      compareAtCents: cheapest.compare_at ?? undefined,
      currency: cheapest.currency,
    });
  }

  const variantIds = variantRows.map((v) => v.id);
  if (variantIds.length > 0) {
    const { data: invRows } = await supabase.from("inventory_items").select("variant_id, stock_on_hand").in("variant_id", variantIds);
    const stockByVariant = new Map(((invRows ?? []) as { variant_id: string; stock_on_hand: number }[]).map((r) => [r.variant_id, r.stock_on_hand]));
    for (const v of variantRows) {
      const stock = stockByVariant.get(v.id) ?? 0;
      empty.stockOnHandByProduct.set(v.product_id, (empty.stockOnHandByProduct.get(v.product_id) ?? 0) + stock);
    }
  }

  const mediaRows = (mediaRes.data ?? []) as { product_id: string; url: string; alt: string | null }[];
  for (const row of mediaRows) {
    const list = empty.mediaByProduct.get(row.product_id) ?? [];
    list.push({ url: row.url, alt: row.alt });
    empty.mediaByProduct.set(row.product_id, list);
  }

  const catLinkRows = (catLinksRes.data ?? []) as { product_id: string; categories: { handle: string } | { handle: string }[] | null }[];
  for (const row of catLinkRows) {
    const handles = Array.isArray(row.categories) ? row.categories.map((c) => c.handle) : row.categories ? [row.categories.handle] : [];
    const list = empty.categoryHandlesByProduct.get(row.product_id) ?? [];
    list.push(...handles);
    empty.categoryHandlesByProduct.set(row.product_id, list);
  }

  for (const row of (dollModelsRes.data ?? []) as { product_id: string }[]) empty.dollProductIds.add(row.product_id);

  const reviewRows = (reviewsRes.data ?? []) as { product_id: string; rating: number }[];
  const sums = new Map<string, { sum: number; count: number }>();
  for (const row of reviewRows) {
    const cur = sums.get(row.product_id) ?? { sum: 0, count: 0 };
    cur.sum += row.rating;
    cur.count += 1;
    sums.set(row.product_id, cur);
  }
  for (const [productId, { sum, count }] of sums) empty.ratingByProduct.set(productId, { avg: sum / count, count });

  return empty;
}

function toSummary(row: ProductRow, hydrated: Hydrated): ProductSummary {
  const variant = hydrated.variantByProduct.get(row.id);
  const media = hydrated.mediaByProduct.get(row.id) ?? [];
  const categoryHandles = hydrated.categoryHandlesByProduct.get(row.id) ?? [];
  const rating = hydrated.ratingByProduct.get(row.id);
  const stockOnHand = hydrated.stockOnHandByProduct.get(row.id) ?? 0;

  return {
    id: row.id,
    slug: row.handle,
    title: row.title,
    productType: PRODUCT_TYPE_MAP[row.product_type] ?? "standard",
    categoryHandles,
    priceCents: variant?.priceCents ?? 0,
    compareAtCents: variant?.compareAtCents,
    currency: variant?.currency ?? "USD",
    shortDescription: row.short_description ?? "",
    imageUrl: media[0]?.url ?? "",
    imageAlt: media[0]?.alt ?? row.title,
    isNew: categoryHandles.includes("new-arrivals"),
    isBestSeller: categoryHandles.includes("best-sellers"),
    onSale: categoryHandles.includes("sale") || (variant?.compareAtCents !== undefined && variant.compareAtCents > variant.priceCents),
    readyToShip: row.stock_policy === "IN_STOCK" && stockOnHand > 0,
    customizable: row.product_type === "CONFIGURABLE" || hydrated.dollProductIds.has(row.id),
    rating: rating?.avg,
    reviewCount: rating?.count,
    tags: [],
    isIndexable: row.is_indexable,
  };
}

export async function getAllProducts(): Promise<ProductSummary[]> {
  const tenantId = await getTenantId();
  const { data, error } = await db().from("products").select(PRODUCT_COLUMNS).eq("tenant_id", tenantId).eq("status", "PUBLISHED");
  if (error) throw new Error(`Could not load products: ${error.message}`);
  const rows = (data ?? []) as ProductRow[];
  const hydrated = await hydrate(rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, hydrated));
}

/** Admin views need drafts too (the WooCommerce importer lands everything as DRAFT for review) — no status filter. */
export interface AdminProductSummary extends ProductSummary {
  status: string;
}

export async function getAllProductsForAdmin(): Promise<AdminProductSummary[]> {
  const tenantId = await getTenantId();
  const { data, error } = await db().from("products").select(`${PRODUCT_COLUMNS}, status`).eq("tenant_id", tenantId);
  if (error) throw new Error(`Could not load products: ${error.message}`);
  const rows = (data ?? []) as (ProductRow & { status: string })[];
  const hydrated = await hydrate(rows.map((r) => r.id));
  return rows.map((r) => ({ ...toSummary(r, hydrated), status: r.status }));
}

export async function getProductsBySlugs(slugs: string[]): Promise<ProductSummary[]> {
  if (slugs.length === 0) return [];
  const tenantId = await getTenantId();
  const { data, error } = await db().from("products").select(PRODUCT_COLUMNS).eq("tenant_id", tenantId).eq("status", "PUBLISHED").in("handle", slugs);
  if (error) throw new Error(`Could not load products: ${error.message}`);
  const rows = (data ?? []) as ProductRow[];
  const hydrated = await hydrate(rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, hydrated));
}

export async function getProductsByCategory(handle: string): Promise<ProductSummary[]> {
  const tenantId = await getTenantId();
  const supabase = db();
  const { data: category } = await supabase.from("categories").select("id").eq("tenant_id", tenantId).eq("handle", handle).maybeSingle();
  if (!category) return [];

  const { data, error } = await supabase
    .from("products")
    .select(`${PRODUCT_COLUMNS}, product_categories!inner(category_id)`)
    .eq("tenant_id", tenantId)
    .eq("status", "PUBLISHED")
    .eq("product_categories.category_id", category.id);
  if (error) throw new Error(`Could not load products for category "${handle}": ${error.message}`);

  const rows = (data ?? []) as ProductRow[];
  const hydrated = await hydrate(rows.map((r) => r.id));
  return rows.map((r) => toSummary(r, hydrated));
}

const GENERIC_WHATS_INCLUDED_DOLL = ["Configured doll", "Care instructions booklet", "Storage bag"];
const GENERIC_WHATS_INCLUDED_OTHER = ["Product", "Charging cable (if applicable)", "Care instructions"];
const GENERIC_CARE_SUMMARY =
  "Clean with warm water and a pH-neutral, fragrance-free cleanser. Air dry fully before storage. Avoid prolonged sun exposure and oil-based lubricants with silicone.";
const GENERIC_FAQS = [
  {
    q: "Is packaging discreet?",
    a: "Yes — all orders ship in plain outer packaging with no product imagery or descriptive text, and a neutral billing descriptor where supported by our payment provider.",
  },
  {
    q: "What is your return policy?",
    a: "Unopened, unused items in original packaging are eligible for return within the window shown at checkout. For hygiene reasons, some categories are final sale once opened — see our Returns guide for details.",
  },
];

function deliverySummary(row: ProductRow, isDoll: boolean): string {
  if (row.stock_policy === "MADE_TO_ORDER" || isDoll) {
    const days = row.production_days ?? 14;
    return `Made to order. Production time ${days - 4}–${days + 4} days depending on configuration, then discreet freight delivery in plain packaging.`;
  }
  const dispatch = row.dispatch_days ?? 2;
  return `Ships within ${dispatch} business day${dispatch === 1 ? "" : "s"} in plain, unmarked packaging with no visible branding.`;
}

function warrantySummary(row: ProductRow, isDoll: boolean): string {
  if (row.warranty_details) return row.warranty_details;
  const months = row.warranty_months ?? (isDoll ? 12 : 3);
  return `${months}-month limited warranty${isDoll ? " covering skeleton and seams." : " against manufacturing defects."}`;
}

/** Storefront/admin doll-configurator pages need "a" configurable doll product rather than a hardcoded demo slug — the first published one, by title. */
export async function getFirstConfigurableDollProduct(): Promise<ProductDetail | undefined> {
  const tenantId = await getTenantId();
  const { data } = await db()
    .from("doll_models")
    .select("product_id, products!inner(handle, tenant_id, status)")
    .eq("products.tenant_id", tenantId)
    .eq("products.status", "PUBLISHED")
    .limit(1)
    .maybeSingle();
  if (!data) return undefined;
  const row = data as { product_id: string; products: { handle: string } | { handle: string }[] };
  const productsField = Array.isArray(row.products) ? row.products[0] : row.products;
  if (!productsField) return undefined;
  return getProductBySlug(productsField.handle);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | undefined> {
  const tenantId = await getTenantId();
  const supabase = db();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "PUBLISHED")
    .eq("handle", slug)
    .maybeSingle();
  if (error) throw new Error(`Could not load product "${slug}": ${error.message}`);
  if (!data) return undefined;
  const row = data as ProductRow;

  const [hydrated, specsRes, gallery, dollConfigurator, linksRes] = await Promise.all([
    hydrate([row.id]),
    supabase.from("product_specs").select("group, label, value, position").eq("product_id", row.id).order("position"),
    supabase.from("product_media").select("url, alt, position").eq("product_id", row.id).order("position"),
    getDollConfiguratorForProduct(row.id),
    supabase.from("compatibility_links").select("to_product_id, relation_type").eq("from_product_id", row.id),
  ]);

  const summary = toSummary(row, hydrated);
  const isDoll = summary.productType === "silicone_doll";

  const specRows = (specsRes.data ?? []) as { group: string; label: string; value: string }[];
  const specGroups: ProductSpecGroup[] = [];
  for (const s of specRows) {
    let group = specGroups.find((g) => g.group === s.group);
    if (!group) {
      group = { group: s.group, items: [] };
      specGroups.push(group);
    }
    group.items.push({ label: s.label, value: s.value });
  }

  const galleryRows = (gallery.data ?? []) as { url: string; alt: string | null }[];

  const linkRows = (linksRes.data ?? []) as { to_product_id: string; relation_type: string }[];
  const accessoryProductIds = linkRows
    .filter((l) => ["compatible_accessory", "replacement_part", "care_product", "compatible_wig"].includes(l.relation_type))
    .map((l) => l.to_product_id);
  let compatibleAccessorySlugs: string[] = [];
  if (accessoryProductIds.length > 0) {
    const { data: accProducts } = await supabase.from("products").select("handle").in("id", accessoryProductIds).eq("status", "PUBLISHED");
    compatibleAccessorySlugs = ((accProducts ?? []) as { handle: string }[]).map((p) => p.handle);
  }

  // No explicit "related products" relation in the schema — fall back to
  // other published products sharing at least one of this product's categories.
  let relatedSlugs: string[] = [];
  if (summary.categoryHandles.length > 0) {
    const { data: catRows } = await supabase.from("categories").select("id").eq("tenant_id", tenantId).in("handle", summary.categoryHandles);
    const categoryIds = ((catRows ?? []) as { id: string }[]).map((c) => c.id);
    if (categoryIds.length > 0) {
      const { data: related } = await supabase
        .from("products")
        .select("handle, product_categories!inner(category_id)")
        .eq("tenant_id", tenantId)
        .eq("status", "PUBLISHED")
        .neq("id", row.id)
        .in("product_categories.category_id", categoryIds)
        .limit(4);
      relatedSlugs = [...new Set(((related ?? []) as { handle: string }[]).map((p) => p.handle))];
    }
  }

  return {
    ...summary,
    gallery: galleryRows.length > 0 ? galleryRows.map((g) => ({ url: g.url, alt: g.alt ?? summary.title })) : [{ url: summary.imageUrl, alt: summary.imageAlt }],
    description: row.description ?? summary.shortDescription,
    specGroups,
    whatsIncluded: isDoll ? GENERIC_WHATS_INCLUDED_DOLL : GENERIC_WHATS_INCLUDED_OTHER,
    careSummary: row.care_instructions ?? GENERIC_CARE_SUMMARY,
    deliverySummary: deliverySummary(row, isDoll),
    warrantySummary: warrantySummary(row, isDoll),
    faqs: GENERIC_FAQS,
    compatibleAccessorySlugs,
    relatedSlugs,
    dollConfigurator,
  };
}
