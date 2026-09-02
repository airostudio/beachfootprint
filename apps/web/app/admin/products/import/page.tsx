"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Mode = "csv" | "woocommerce" | "aliexpress";
type Phase = "idle" | "uploading" | "processing" | "done" | "error";

interface ImportRowError {
  rowNumber: number;
  handle?: string;
  message: string;
}

interface ConversionSummary {
  totalRows: number;
  excludedTitles: string[];
  typeCounts: Record<string, number>;
}

interface ImportedSku {
  aliexpressSkuId: string;
  properties: string | null;
  retailPriceCents: number;
  supplierCostCents: number;
  marginRate: number;
  stockOnHand: number;
}

interface ImportProductResult {
  aliexpressProductId: string;
  onBrandName: string;
  description: string;
  imageUrls: string[];
  currencyCode: string;
  skus: ImportedSku[];
}

interface CategoryOption {
  id: string;
  handle: string;
  name: string;
}

type StagedStatus = "staging" | "ready" | "confirming" | "confirmed" | "error";

interface StagedProduct {
  key: string;
  status: StagedStatus;
  input: string;
  imported: ImportProductResult | null;
  categoryId: string | null;
  suggestedCategoryHandle: string | null;
  error: string | null;
  selected: boolean;
  commitHandle: string | null;
}

const MODE_CONFIG: Record<Mode, { label: string; accept: string; createEndpoint: string; contentType: string }> = {
  csv: {
    label: "CSV",
    accept: ".csv,text/csv",
    createEndpoint: "/api/admin/imports",
    contentType: "text/csv",
  },
  woocommerce: {
    label: "WooCommerce Export (.xlsx)",
    accept: ".xlsx",
    createEndpoint: "/api/admin/imports/woocommerce",
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  // Not file-based — the AliExpress mode has its own dedicated UI/handler below and never calls runImport().
  aliexpress: { label: "AliExpress", accept: "", createEndpoint: "", contentType: "" },
};

/** Pulls the numeric product id out of an AliExpress product URL, or passes through a bare id. */
function extractAliExpressProductId(input: string): string | null {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/aliexpress\.[a-z.]+\/item\/(?:.*\/)?(\d+)\.html/i) ?? trimmed.match(/[?&]productId=(\d+)/i);
  if (urlMatch) return urlMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

export default function ProductImportPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("csv");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [processedRows, setProcessedRows] = useState(0);
  const [skippedExisting, setSkippedExisting] = useState(0);
  const [markedOutOfStock, setMarkedOutOfStock] = useState<number | undefined>(undefined);
  const [markMissingOutOfStock, setMarkMissingOutOfStock] = useState(false);
  const [errors, setErrors] = useState<ImportRowError[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ConversionSummary | null>(null);

  const [aliexpressInput, setAliexpressInput] = useState("");
  const [aliexpressSearch, setAliexpressSearch] = useState("");
  const [staged, setStaged] = useState<StagedProduct[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [confirmingAll, setConfirmingAll] = useState(false);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((res) => res.json())
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => setCategories([]));
  }, []);

  function openAliExpressSearch() {
    const url = aliexpressSearch.trim()
      ? `https://www.aliexpress.com/wholesale?SearchText=${encodeURIComponent(aliexpressSearch.trim())}`
      : "https://www.aliexpress.com/";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function updateStaged(key: string, patch: Partial<StagedProduct>) {
    setStaged((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  // Adds a product to the review list and immediately runs it through the engine's fetch + AI
  // rewrite + category suggestion. Nothing is written to the store yet — that only happens once
  // this staged item is individually confirmed (or swept up by "Confirm selected").
  async function stageAliExpressProduct() {
    const productId = extractAliExpressProductId(aliexpressInput);
    if (!productId) {
      setMessage("Paste a valid AliExpress product URL (e.g. aliexpress.com/item/1005006308361133.html) or a bare product id.");
      return;
    }
    setMessage(null);
    const key = `${productId}-${Date.now()}`;
    setStaged((prev) => [
      { key, status: "staging", input: productId, imported: null, categoryId: null, suggestedCategoryHandle: null, error: null, selected: true, commitHandle: null },
      ...prev,
    ]);
    setAliexpressInput("");

    try {
      const res = await fetch("/api/admin/products/aliexpress/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not fetch this product");
      updateStaged(key, {
        status: "ready",
        imported: data as ImportProductResult,
        categoryId: data.suggestedCategoryId ?? null,
        suggestedCategoryHandle: data.suggestedCategoryHandle ?? null,
      });
    } catch (err) {
      updateStaged(key, { status: "error", error: err instanceof Error ? err.message : "Could not fetch this product" });
    }
  }

  async function confirmStaged(item: StagedProduct) {
    if (!item.imported) return;
    updateStaged(item.key, { status: "confirming", error: null });
    try {
      const res = await fetch("/api/admin/products/aliexpress/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imported: item.imported, categoryId: item.categoryId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not add this product to the store");
      updateStaged(item.key, { status: "confirmed", commitHandle: data.handle, selected: false });
    } catch (err) {
      updateStaged(item.key, { status: "error", error: err instanceof Error ? err.message : "Could not add this product to the store" });
    }
  }

  async function confirmSelected() {
    setConfirmingAll(true);
    const toConfirm = staged.filter((s) => s.selected && s.status === "ready");
    for (const item of toConfirm) {
      await confirmStaged(item);
    }
    setConfirmingAll(false);
  }

  const readyStaged = staged.filter((s) => s.status === "ready");
  const allReadySelected = readyStaged.length > 0 && readyStaged.every((s) => s.selected);

  async function runImport(file: File) {
    const config = MODE_CONFIG[mode];
    setPhase("uploading");
    setProgress(0);
    setProcessedRows(0);
    setSkippedExisting(0);
    setMarkedOutOfStock(undefined);
    setErrors([]);
    setMessage(null);
    setSummary(null);

    try {
      // 1) Get a signed upload URL and PUT the file straight to storage —
      // this request never carries the file's bytes, only JSON.
      const uploadUrlRes = await fetch("/api/admin/imports/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name }),
      });
      if (!uploadUrlRes.ok) throw new Error("Could not get an upload URL");
      const { path, signedUrl } = await uploadUrlRes.json();

      // 2) Upload directly to storage. This is the step that would otherwise
      // hit a serverless function's request-body ceiling for a large file —
      // going straight to storage sidesteps it entirely.
      const putRes = await fetch(signedUrl, { method: "PUT", headers: { "Content-Type": config.contentType }, body: file });
      if (!putRes.ok) throw new Error("Upload to storage failed");

      // 3) Register the import job. For WooCommerce this also converts the
      // workbook to the standard CSV format server-side first.
      const createRes = await fetch(config.createEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, markMissingOutOfStock }),
      });
      if (!createRes.ok) {
        const body = await createRes.json().catch(() => null);
        throw new Error(body?.error ?? "Could not create the import job");
      }
      const created = await createRes.json();
      if (mode === "woocommerce") {
        setSummary({ totalRows: created.totalRows, excludedTitles: created.excludedTitles ?? [], typeCounts: created.typeCounts ?? {} });
      }

      // 4) Drive it to completion — one small byte-range chunk per call, so
      // no single request ever has to parse or upsert the whole file.
      setPhase("processing");
      let done = false;
      while (!done) {
        const processRes = await fetch(`/api/admin/imports/${created.id}/process`, { method: "POST" });
        if (!processRes.ok) throw new Error("A chunk failed to process");
        const chunk = await processRes.json();
        done = chunk.done;
        setProgress(chunk.progress ?? 0);
        setProcessedRows(chunk.result?.processedRows ?? 0);
        setSkippedExisting(chunk.result?.skippedExisting ?? 0);
        setMarkedOutOfStock(chunk.result?.markedOutOfStock);
        setErrors(chunk.result?.errors ?? []);
      }

      setPhase("done");
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Import failed");
    }
  }

  const busy = phase === "uploading" || phase === "processing";

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/admin/products" className="text-xs text-stone-500 underline">
          ← Back to Products
        </Link>
      </div>
      <h1 className="font-serif text-3xl mb-3">Import Products</h1>
      <p className="text-sm text-stone-500 mb-8">
        Handles files of any size — the upload goes straight to storage, then gets processed in small
        byte-range chunks (a few hundred KB at a time) so nothing ever hits a request-size or execution-time
        ceiling, however large the file is.
      </p>

      <div className="flex gap-2 mb-8">
        {(Object.keys(MODE_CONFIG) as Mode[]).map((m) => (
          <button
            key={m}
            disabled={busy}
            onClick={() => {
              setMode(m);
              setPhase("idle");
              setSummary(null);
              setErrors([]);
              setMessage(null);
            }}
            className={`text-xs tracking-widest2 uppercase px-4 py-2 border ${
              mode === m ? "border-ink-950 bg-ink-950 text-warm-50" : "border-stone-300 text-stone-500"
            }`}
          >
            {MODE_CONFIG[m].label}
          </button>
        ))}
      </div>

      {mode === "csv" && (
        <div className="border border-stone-200 p-6 mb-8">
          <p className="text-xs font-medium mb-2">Expected columns</p>
          <p className="text-xs text-stone-500 leading-relaxed">
            handle, title, product_type, short_description, description, price, compare_at, sku, stock_on_hand,
            category_handles (pipe- or comma-separated existing category handles), brand, material, height_cm, status,
            image_urls (pipe- or comma-separated, already-hosted image URLs — first is used as the primary image)
          </p>
        </div>
      )}
      {mode === "woocommerce" && (
        <div className="border border-stone-200 p-6 mb-8">
          <p className="text-xs font-medium mb-2">What this does</p>
          <p className="text-xs text-stone-500 leading-relaxed">
            Upload a WooCommerce product-export .xlsx directly. Converted server-side into the
            same import format — product type and category are classified from the title and WooCommerce categories,
            material/height are parsed from the embedded spec table, and every row lands as{" "}
            <span className="font-medium">DRAFT</span> for review before publishing. Images are referenced from the
            source site's own URLs, not re-hosted here.
          </p>
        </div>
      )}
      {mode === "aliexpress" && (
        <div className="border border-stone-200 p-6 mb-8">
          <p className="text-xs font-medium mb-2">Step 1 — Find a product</p>
          <p className="text-xs text-stone-500 leading-relaxed mb-4">
            AliExpress doesn&rsquo;t allow its pages to open inside another site, so search opens in a new tab.
            Browse or search normally there, then come back here and paste the product&rsquo;s link below.
          </p>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={aliexpressSearch}
              onChange={(e) => setAliexpressSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") openAliExpressSearch();
              }}
              placeholder="e.g. woven beach bag"
              className="flex-1 border border-stone-300 px-3 py-2 text-sm"
            />
            <button className="btn-secondary whitespace-nowrap" onClick={openAliExpressSearch}>
              Search AliExpress ↗
            </button>
          </div>

          <p className="text-xs font-medium mb-2 mt-6">Step 2 — Add it to the review list</p>
          <p className="text-xs text-stone-500 leading-relaxed mb-4">
            Paste the product page link (or its bare product id) below. It&rsquo;s added to the list underneath and the
            engine immediately fetches it, applies your pricing rule, and — if AI copy rewriting is on — rewrites the
            title and description to be SEO-friendly and on-brand, and suggests a category. Nothing is added to the
            store yet: review each item below, adjust its category if needed, then confirm it (or select several and
            confirm them together).
          </p>
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={aliexpressInput}
              onChange={(e) => setAliexpressInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") stageAliExpressProduct();
              }}
              placeholder="https://www.aliexpress.com/item/1005006308361133.html"
              className="flex-1 border border-stone-300 px-3 py-2 text-sm"
            />
            <button className="btn-primary whitespace-nowrap" disabled={!aliexpressInput} onClick={stageAliExpressProduct}>
              Add to review list
            </button>
          </div>
          {message && <p className="text-sm text-red-600 mb-4">{message}</p>}

          {staged.length > 0 && (
            <div className="mt-6">
              <div className="flex justify-between items-center mb-3">
                <p className="text-xs font-medium">
                  Review list ({staged.length}){readyStaged.length > 0 && ` · ${readyStaged.length} ready to confirm`}
                </p>
                {readyStaged.length > 0 && (
                  <div className="flex gap-3 items-center">
                    <label className="flex items-center gap-1.5 text-xs text-stone-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allReadySelected}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setStaged((prev) => prev.map((s) => (s.status === "ready" ? { ...s, selected: checked } : s)));
                        }}
                      />
                      Select all
                    </label>
                    <button
                      className="btn-secondary text-xs"
                      disabled={confirmingAll || !staged.some((s) => s.selected && s.status === "ready")}
                      onClick={confirmSelected}
                    >
                      {confirmingAll ? "Confirming…" : "Confirm selected"}
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {staged.map((item) => (
                  <div key={item.key} className="border border-stone-200 p-4 flex gap-4">
                    {item.status === "ready" && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={item.selected}
                        onChange={(e) => updateStaged(item.key, { selected: e.target.checked })}
                      />
                    )}
                    {item.imported?.imageUrls[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imported.imageUrls[0]} alt="" className="w-16 h-16 object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {item.status === "staging" && <p className="text-sm text-stone-500">Fetching &amp; rewriting {item.input}…</p>}
                      {item.status === "error" && (
                        <>
                          <p className="text-sm text-red-600">{item.error}</p>
                          <p className="text-xs text-stone-400">Product {item.input}</p>
                        </>
                      )}
                      {item.status === "confirmed" && (
                        <p className="text-sm">
                          Added <span className="font-medium">{item.commitHandle}</span> — see it in{" "}
                          <Link href="/admin/products" className="underline">
                            Products
                          </Link>
                          .
                        </p>
                      )}
                      {(item.status === "ready" || item.status === "confirming") && item.imported && (
                        <>
                          <p className="text-sm font-medium truncate">{item.imported.onBrandName}</p>
                          <p className="text-xs text-stone-500 line-clamp-2 mt-1">{item.imported.description.slice(0, 220)}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <select
                              className="border border-stone-300 text-xs px-2 py-1"
                              value={item.categoryId ?? ""}
                              disabled={item.status === "confirming"}
                              onChange={(e) => updateStaged(item.key, { categoryId: e.target.value || null })}
                            >
                              <option value="">No category</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            {item.suggestedCategoryHandle && !item.categoryId && (
                              <span className="text-xs text-stone-400">suggested: {item.suggestedCategoryHandle}</span>
                            )}
                            <button
                              className="btn-secondary text-xs ml-auto"
                              disabled={item.status === "confirming"}
                              onClick={() => confirmStaged(item)}
                            >
                              {item.status === "confirming" ? "Confirming…" : "Confirm"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode !== "aliexpress" && (
        <>
          <label className="flex items-start gap-2 mb-6 text-xs text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={markMissingOutOfStock}
              disabled={busy}
              onChange={(e) => setMarkMissingOutOfStock(e.target.checked)}
            />
            <span>
              Mark products not in this file as <span className="font-medium">Out Of Stock</span>. Existing products
              are always left alone by default — this only affects products sharing a brand with the imported file
              whose handle doesn&apos;t appear in it (their stock is set to 0; they are not deleted or unpublished).
            </span>
          </label>

          <input
            ref={fileInput}
            type="file"
            accept={MODE_CONFIG[mode].accept}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) runImport(file);
            }}
          />

          <button className="btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {phase === "idle" && `Choose ${mode === "csv" ? "CSV" : ".xlsx"} File`}
            {phase === "uploading" && "Uploading…"}
            {phase === "processing" && "Processing…"}
            {(phase === "done" || phase === "error") && "Import Another File"}
          </button>
        </>
      )}

      {summary && (
        <div className="mt-6 border border-stone-200 p-4 text-xs text-stone-600">
          <p className="mb-1">
            <span className="font-medium">{summary.totalRows}</span> product row(s) converted
            {summary.excludedTitles.length > 0 && ` · ${summary.excludedTitles.length} row(s) excluded (not real products)`}
          </p>
          <p className="text-stone-500">
            {Object.entries(summary.typeCounts)
              .map(([type, count]) => `${count} ${type}`)
              .join(" · ")}
          </p>
        </div>
      )}

      {mode !== "aliexpress" && phase !== "idle" && (
        <div className="mt-8">
          <div className="h-2 bg-stone-200 w-full">
            <div className="h-2 bg-ink-950 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-stone-500 mt-2">
            {progress}% · {processedRows} new product{processedRows === 1 ? "" : "s"} added
            {skippedExisting > 0 ? ` · ${skippedExisting} already existed (left alone)` : ""}
            {markedOutOfStock !== undefined ? ` · ${markedOutOfStock} marked out of stock` : ""}
            {errors.length > 0 ? ` · ${errors.length} row error${errors.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
      )}

      {mode !== "aliexpress" && phase === "done" && <p className="text-sm mt-4">Import complete.</p>}
      {mode !== "aliexpress" && phase === "error" && <p className="text-sm text-red-600 mt-4">{message}</p>}

      {errors.length > 0 && (
        <div className="mt-6 border border-stone-200 max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-stone-500 border-b border-stone-200">
                <th className="p-2">Row</th>
                <th className="p-2">Handle</th>
                <th className="p-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={i} className="border-b border-stone-100">
                  <td className="p-2">{e.rowNumber >= 0 ? e.rowNumber : "—"}</td>
                  <td className="p-2">{e.handle ?? "—"}</td>
                  <td className="p-2">{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
