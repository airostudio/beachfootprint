"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatMoney } from "@/lib/format";
import { deleteProducts, publishProduct, setProductsStatus } from "@/app/admin/products/actions";
import type { AdminProductSummary } from "@/lib/data/products";

export default function ProductsTable({
  products,
  storeCurrency,
}: {
  products: AdminProductSummary[];
  storeCurrency: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const allSelected = products.length > 0 && products.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((p) => p.id)));
  }

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage({ ok: result.ok, text: result.message });
      setSelected(new Set());
      router.refresh();
    });
  }

  function confirmDelete() {
    const count = selected.size;
    const ok = window.confirm(
      `Delete ${count} product${count === 1 ? "" : "s"}?\n\nThis removes them, their variants, images and stock permanently. ` +
        "Products that appear in past orders can't be deleted and will be listed instead — archive those.",
    );
    if (ok) run(() => deleteProducts([...selected]));
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-3 min-h-[34px]">
        {someSelected ? (
          <>
            <span className="text-xs text-stone-600">
              {selected.size} selected
            </span>
            <button className="btn-secondary text-xs px-3 py-1.5" disabled={pending} onClick={() => run(() => setProductsStatus([...selected], "PUBLISHED"))}>
              Publish
            </button>
            <button className="btn-secondary text-xs px-3 py-1.5" disabled={pending} onClick={() => run(() => setProductsStatus([...selected], "DRAFT"))}>
              Move to Draft
            </button>
            <button className="btn-secondary text-xs px-3 py-1.5" disabled={pending} onClick={() => run(() => setProductsStatus([...selected], "ARCHIVED"))}>
              Archive
            </button>
            <button
              className="text-xs px-3 py-1.5 text-red-600 border border-red-200 hover:bg-red-50"
              disabled={pending}
              onClick={confirmDelete}
            >
              Delete
            </button>
            <button className="text-xs underline text-stone-500" disabled={pending} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            {pending && <span className="text-xs text-stone-500">Working…</span>}
          </>
        ) : (
          <span className="text-xs text-stone-400">Tick products to publish, archive or delete them together.</span>
        )}
      </div>

      {message && (
        <p className={`text-xs mb-3 ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-stone-500 border-b border-stone-200">
            <th className="py-2 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={products.length === 0}
                aria-label="Select all products"
              />
            </th>
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
            <tr key={p.id} className={`border-b border-stone-100 ${selected.has(p.id) ? "bg-warm-100" : ""}`}>
              <td className="py-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`Select ${p.title}`}
                />
              </td>
              <td className="py-2">
                <Link href={`/admin/products/${p.id}`} className="hover:underline">
                  {p.title}
                </Link>
              </td>
              <td className="py-2 text-stone-500">{p.productType}</td>
              <td className="py-2">
                {p.priceCents > 0 ? formatMoney(p.priceCents, p.currency) : <span className="text-red-600">no price</span>}
              </td>
              <td className={`py-2 ${p.currency === storeCurrency ? "text-stone-500" : "text-red-600 font-medium"}`}>
                {p.currency}
              </td>
              <td className="py-2 text-stone-500">{p.status}</td>
              <td className="py-2">
                <div className="flex gap-3 items-center">
                  <Link href={`/admin/products/${p.id}`} className="text-xs underline">
                    Edit
                  </Link>
                  {p.status !== "PUBLISHED" && (
                    <form action={publishProduct.bind(null, p.id)}>
                      <button type="submit" className="text-xs underline">
                        Publish
                      </button>
                    </form>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
