"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface StagedSku {
  aliexpressSkuId: string;
  properties: string | null;
  retailPriceCents: number;
  compareAtCents: number | null;
  supplierCostCents: number;
  marginRate: number;
  stockOnHand: number;
  isActive: boolean;
}

interface StagedProduct {
  id: string;
  aliexpressProductId: string;
  sourceUrl: string | null;
  status: "ready" | "failed" | "confirmed";
  error: string | null;
  title: string;
  shortDescription: string;
  description: string;
  seoTitle: string | null;
  seoDesc: string | null;
  categoryId: string | null;
  suggestedCategoryId: string | null;
  publish: boolean;
  productType: string;
  brand: string | null;
  currencyCode: string;
  imageUrls: string[];
  skus: StagedSku[];
}

interface CategoryOption {
  id: string;
  handle: string;
  name: string;
}

const PRODUCT_TYPES = ["STANDARD", "ACCESSORY", "CARE_PRODUCT", "BUNDLE", "GIFT_CARD"];

function centsToDollars(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

function dollarsToCents(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

export default function StagedProductEditor({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [product, setProduct] = useState<StagedProduct | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [productRes, categoriesRes] = await Promise.all([
        fetch(`/api/admin/products/aliexpress/staged/${params.id}`),
        fetch("/api/admin/categories"),
      ]);
      const data = await productRes.json();
      if (!productRes.ok) throw new Error(data.error ?? "Could not load this staged product");
      const categoriesData = await categoriesRes.json().catch(() => ({ categories: [] }));
      setProduct(data);
      setCategories(categoriesData.categories ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this staged product");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function update(patch: Partial<StagedProduct>) {
    setProduct((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
    setSavedAt(null);
  }

  function updateSku(index: number, patch: Partial<StagedSku>) {
    setProduct((prev) =>
      prev ? { ...prev, skus: prev.skus.map((sku, i) => (i === index ? { ...sku, ...patch } : sku)) } : prev,
    );
    setDirty(true);
    setSavedAt(null);
  }

  function moveImage(from: number, to: number) {
    setProduct((prev) => {
      if (!prev || to < 0 || to >= prev.imageUrls.length) return prev;
      const next = [...prev.imageUrls];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, imageUrls: next };
    });
    setDirty(true);
    setSavedAt(null);
  }

  async function save(): Promise<boolean> {
    if (!product) return false;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/products/aliexpress/staged/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: product.title,
          shortDescription: product.shortDescription,
          description: product.description,
          seoTitle: product.seoTitle,
          seoDesc: product.seoDesc,
          categoryId: product.categoryId,
          publish: product.publish,
          productType: product.productType,
          brand: product.brand,
          imageUrls: product.imageUrls,
          skus: product.skus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not save your changes");
      setProduct(data);
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your changes");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Save first so the store gets exactly what's on screen, then commit.
  async function saveAndConfirm() {
    if (!product) return;
    setConfirming(true);
    try {
      if (dirty && !(await save())) return;
      const res = await fetch("/api/admin/products/aliexpress/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stagedIds: [product.id] }),
      });
      const data = await res.json();
      const outcome = data.results?.[0];
      if (!res.ok || !outcome?.ok) throw new Error(outcome?.error ?? data.error ?? "Could not add this product to the store");
      router.push("/admin/aliexpress/staging");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this product to the store");
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>;
  if (!product) return <p className="text-sm text-red-600">{error ?? "Not found"}</p>;

  const busy = saving || confirming;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/aliexpress/staging" className="text-xs text-stone-500 underline">
          ← Back to Staging
        </Link>
      </div>

      <div className="flex justify-between items-start mb-8 gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Staged product</p>
          <h1 className="font-serif text-3xl truncate">{product.title}</h1>
          <p className="text-xs text-stone-500 mt-1">
            AliExpress ID {product.aliexpressProductId}
            {product.sourceUrl && (
              <>
                {" · "}
                <a href={product.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  view on AliExpress ↗
                </a>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button className="btn-secondary" disabled={busy || !dirty} onClick={save}>
            {saving ? "Saving…" : dirty ? "Save changes" : savedAt ? `Saved ${savedAt}` : "Saved"}
          </button>
          <button className="btn-primary" disabled={busy} onClick={saveAndConfirm}>
            {confirming ? "Adding…" : "Confirm & add to store"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-6">{error}</p>}

      <section className="card p-6 mb-6">
        <h2 className="text-sm font-medium mb-4">Images</h2>
        {product.imageUrls.length === 0 && <p className="text-xs text-stone-500">No images came back from AliExpress.</p>}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {product.imageUrls.map((url, i) => (
            <div key={`${url}-${i}`} className="border border-stone-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full aspect-square object-cover bg-stone-100" />
              <div className="flex justify-between items-center px-1 py-1 text-[10px]">
                <span className={i === 0 ? "font-medium" : "text-stone-400"}>{i === 0 ? "Primary" : i + 1}</span>
                <span className="flex gap-1">
                  <button className="underline disabled:opacity-30" disabled={i === 0} onClick={() => moveImage(i, i - 1)}>
                    ←
                  </button>
                  <button
                    className="underline disabled:opacity-30"
                    disabled={i === product.imageUrls.length - 1}
                    onClick={() => moveImage(i, i + 1)}
                  >
                    →
                  </button>
                  <button
                    className="underline text-red-600"
                    onClick={() => update({ imageUrls: product.imageUrls.filter((_, idx) => idx !== i) })}
                  >
                    ✕
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-stone-500 mt-3">The first image becomes the product&rsquo;s primary image.</p>
      </section>

      <section className="card p-6 mb-6">
        <h2 className="text-sm font-medium mb-4">Listing copy</h2>
        <label className="block text-xs text-stone-600 mb-1">Title</label>
        <input
          type="text"
          value={product.title}
          onChange={(e) => update({ title: e.target.value })}
          className="w-full border border-stone-300 px-3 py-2 text-sm mb-1"
        />
        <p className="text-[10px] text-stone-400 mb-4">{product.title.length} characters — aim for under 70 for search results.</p>

        <label className="block text-xs text-stone-600 mb-1">Short description</label>
        <textarea
          value={product.shortDescription}
          onChange={(e) => update({ shortDescription: e.target.value })}
          rows={2}
          className="w-full border border-stone-300 px-3 py-2 text-sm mb-4"
        />

        <label className="block text-xs text-stone-600 mb-1">Description</label>
        <textarea
          value={product.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={14}
          className="w-full border border-stone-300 px-3 py-2 text-sm font-mono mb-4"
        />

        <label className="block text-xs text-stone-600 mb-1">SEO title</label>
        <input
          type="text"
          value={product.seoTitle ?? ""}
          onChange={(e) => update({ seoTitle: e.target.value || null })}
          placeholder="Defaults to the product title"
          className="w-full border border-stone-300 px-3 py-2 text-sm mb-4"
        />

        <label className="block text-xs text-stone-600 mb-1">SEO description</label>
        <textarea
          value={product.seoDesc ?? ""}
          onChange={(e) => update({ seoDesc: e.target.value || null })}
          rows={2}
          placeholder="Defaults to the short description"
          className="w-full border border-stone-300 px-3 py-2 text-sm"
        />
      </section>

      <section className="card p-6 mb-6">
        <h2 className="text-sm font-medium mb-4">Placement</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-stone-600 mb-1">Category</label>
            <select
              value={product.categoryId ?? ""}
              onChange={(e) => update({ categoryId: e.target.value || null })}
              className="w-full border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {product.suggestedCategoryId && (
              <p className="text-[10px] text-stone-400 mt-1">
                {product.categoryId === product.suggestedCategoryId
                  ? "Auto-suggested by AI"
                  : `AI suggested: ${categories.find((c) => c.id === product.suggestedCategoryId)?.name ?? "—"}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">Product type</label>
            <select
              value={product.productType}
              onChange={(e) => update({ productType: e.target.value })}
              className="w-full border border-stone-300 px-3 py-2 text-sm"
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">Brand</label>
            <input
              type="text"
              value={product.brand ?? ""}
              onChange={(e) => update({ brand: e.target.value || null })}
              placeholder="Beach Footprints"
              className="w-full border border-stone-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-600 mb-1">Status when added</label>
            <select
              value={product.publish ? "PUBLISHED" : "DRAFT"}
              onChange={(e) => update({ publish: e.target.value === "PUBLISHED" })}
              className="w-full border border-stone-300 px-3 py-2 text-sm"
            >
              <option value="DRAFT">Draft — review before it goes live</option>
              <option value="PUBLISHED">Published — live immediately</option>
            </select>
          </div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-medium mb-1">Variants &amp; pricing</h2>
        <p className="text-xs text-stone-500 mb-4">
          Prices came from your pricing rule applied to the live supplier cost. Editing a price here overrides it for
          this import; catalog sync will keep costs and stock current afterwards.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="py-2 pr-2">Variant</th>
                <th className="py-2 pr-2">Cost</th>
                <th className="py-2 pr-2">Price</th>
                <th className="py-2 pr-2">Compare at</th>
                <th className="py-2 pr-2">Stock</th>
                <th className="py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {product.skus.map((sku, i) => (
                <tr key={sku.aliexpressSkuId} className="border-b border-stone-100">
                  <td className="py-2 pr-2">
                    <span className="block max-w-[200px] truncate">{sku.properties || "Default"}</span>
                    <span className="text-[10px] text-stone-400">{sku.aliexpressSkuId}</span>
                  </td>
                  <td className="py-2 pr-2 text-stone-500">{centsToDollars(sku.supplierCostCents)}</td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={centsToDollars(sku.retailPriceCents)}
                      onChange={(e) => updateSku(i, { retailPriceCents: dollarsToCents(e.target.value) ?? 0 })}
                      className="w-20 border border-stone-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={centsToDollars(sku.compareAtCents)}
                      onChange={(e) => updateSku(i, { compareAtCents: dollarsToCents(e.target.value) })}
                      placeholder="—"
                      className="w-20 border border-stone-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min="0"
                      value={sku.stockOnHand}
                      onChange={(e) => updateSku(i, { stockOnHand: Number.parseInt(e.target.value, 10) || 0 })}
                      className="w-16 border border-stone-300 px-2 py-1"
                    />
                  </td>
                  <td className="py-2">
                    <input type="checkbox" checked={sku.isActive} onChange={(e) => updateSku(i, { isActive: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
