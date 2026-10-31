import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { getCategories } from "@/lib/data/categories";
import { getAllProducts } from "@/lib/data/products";
import { getGuides } from "@/lib/data/guides";
import { POLICIES } from "@/lib/legal/policies";

const baseUrl = SITE_URL;

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes = [
    "",
    "/shop",
    "/compare",
    "/product-finder",
    "/care",
    "/journal",
    "/about",
    // Policy pages are indexable on purpose: shoppers look for a store's returns terms before
    // buying, and payment providers check they exist and are reachable.
    ...POLICIES.map((policy) => `/legal/${policy.slug}`),
  ].map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
  }));

  const [categories, products, guides] = await Promise.all([getCategories(), getAllProducts(), getGuides()]);

  const categoryRoutes = categories.map((c) => ({ url: `${baseUrl}/shop/${c.handle}`, lastModified: new Date() }));
  const productRoutes = products
    .filter((p) => p.isIndexable !== false)
    .map((p) => ({ url: `${baseUrl}/product/${p.slug}`, lastModified: new Date() }));
  const guideRoutes = guides.map((g) => ({ url: `${baseUrl}/journal/${g.slug}`, lastModified: new Date(g.updatedAt) }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes, ...guideRoutes];
}
