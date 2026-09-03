import Link from "next/link";
import { getAllProductsForAdmin } from "@/lib/data/products";
import { formatMoney } from "@/lib/format";
import { publishAllDrafts, publishProduct } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await getAllProductsForAdmin();
  const draftCount = products.filter((p) => p.status === "DRAFT").length;

  // What the catalogue is actually priced in. More than one value here means checkout will refuse
  // to mix them in a cart, so it needs fixing rather than just noting.
  const currencyCounts = products.reduce<Record<string, number>>((acc, p) => {
    if (p.priceCents > 0) acc[p.currency] = (acc[p.currency] ?? 0) + 1;
    return acc;
  }, {});
  const currencies = Object.entries(currencyCounts).sort((a, b) => b[1] - a[1]);
  const storeCurrency = currencies[0]?.[0] ?? "USD";
  const unpriced = products.filter((p) => p.priceCents === 0).length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="font-serif text-3xl">Products</h1>
        <div className="flex gap-3">
          <div className="text-xs text-stone-500 mb-4 flex flex-wrap gap-x-4 gap-y-1">
        <span>{products.length} product{products.length === 1 ? "" : "s"}</span>
        <span>
          Priced in{" "}
          {currencies.length === 0 ? (
            <span className="font-medium">—</span>
          ) : (
            currencies.map(([code, count], i) => (
              <span key={code}>
                {i > 0 && ", "}
                <span className={`font-medium ${code === storeCurrency ? "" : "text-red-600"}`}>{code}</span> ({count})
              </span>
            ))
          )}
        </span>
        {unpriced > 0 && <span className="text-red-600">{unpriced} with no price</span>}
      </div>
      {currencies.length > 1 && (
        <p className="text-xs text-red-600 mb-4">
          Products are priced in more than one currency. A cart can only be charged in one, so checkout will refuse any
          basket mixing them — re-price the odd ones out, or re-import them with the right selling currency set in
          Dropship Settings.
        </p>
      )}
      {draftCount > 0 && (
            <form action={publishAllDrafts}>
              <button type="submit" className="btn-secondary">
                Publish All Drafts ({draftCount})
              </button>
            </form>
          )}
          <Link href="/admin/products/import" className="btn-secondary">
            Import Products
          </Link>
          <button className="btn-primary">New Product</button>
        </div>
      </div>
      <div className="text-xs text-stone-500 mb-4 flex flex-wrap gap-x-4 gap-y-1">
        <span>{products.length} product{products.length === 1 ? "" : "s"}</span>
        <span>
          Priced in{" "}
          {currencies.length === 0 ? (
            <span className="font-medium">—</span>
          ) : (
            currencies.map(([code, count], i) => (
              <span key={code}>
                {i > 0 && ", "}
                <span className={`font-medium ${code === storeCurrency ? "" : "text-red-600"}`}>{code}</span> ({count})
              </span>
            ))
          )}
        </span>
        {unpriced > 0 && <span className="text-red-600">{unpriced} with no price</span>}
      </div>
      {currencies.length > 1 && (
        <p className="text-xs text-red-600 mb-4">
          Products are priced in more than one currency. A cart can only be charged in one, so checkout will refuse any
          basket mixing them — re-price the odd ones out, or re-import them with the right selling currency set in
          Dropship Settings.
        </p>
      )}
      {draftCount > 0 && (
        <p className="text-xs text-stone-500 mb-4">
          {draftCount} product{draftCount === 1 ? "" : "s"} imported as Draft and not yet visible on the storefront — publish individually below
          or all at once above.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-stone-500 border-b border-stone-200">
            <th className="py-2">Title</th>
            <th className="py-2">Type</th>
            <th className="py-2">Price</th>
            <th className="py-2">Currency</th>
            <th className="py-2">Status</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-stone-100">
              <td className="py-2">{p.title}</td>
              <td className="py-2 text-stone-500">{p.productType}</td>
              <td className="py-2">{p.priceCents > 0 ? formatMoney(p.priceCents, p.currency) : <span className="text-red-600">no price</span>}</td>
              <td className={`py-2 ${p.currency === storeCurrency ? "text-stone-500" : "text-red-600 font-medium"}`}>{p.currency}</td>
              <td className="py-2 text-stone-500">{p.status}</td>
              <td className="py-2 flex gap-3 items-center">
                <button className="text-xs underline">Edit</button>
                {p.status !== "PUBLISHED" && (
                  <form action={publishProduct.bind(null, p.id)}>
                    <button type="submit" className="text-xs underline">
                      Publish
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
