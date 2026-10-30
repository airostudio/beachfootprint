"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/lib/cart";
import { useProductImage } from "@/components/ProductImageContext";
import {
  findVariant,
  imageForValue,
  imageOptionName,
  initialSelection,
  isValueAvailable,
  optionNames,
  optionValues,
  selectValue,
  type Selection,
} from "@/lib/variantOptions";
import type { ProductVariantSummary } from "@/lib/types";

export default function AddToCartActions({
  priceCents,
  currency,
  variants,
}: {
  priceCents: number;
  currency: string;
  variants: ProductVariantSummary[];
}) {
  const { add } = useCart();
  const picked = useProductImage();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // Options are picked one at a time (Color, then Size) rather than from one long dropdown of every
  // combination. The option the supplier photos belong to (the colour) is shown as photo swatches,
  // so a colour that's only a supplier code — "GN1", "B989Red", "1" — shows the actual colour.
  const names = useMemo(() => optionNames(variants), [variants]);
  const imageOption = useMemo(() => imageOptionName(variants), [variants]);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(variants));
  // Variants without named options (older or single-option products) fall back to a plain dropdown.
  const [selectedId, setSelectedId] = useState(variants.find((v) => v.inStock)?.id ?? variants[0]?.id ?? "");

  // Plain colour words with no supplier photo ("black", "Light blue") are drawn as a colour dot.
  // Checked after mount: CSS.supports only exists in the browser.
  const [cssColours, setCssColours] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (typeof CSS === "undefined") return;
    const found = new Set<string>();
    for (const name of names) for (const value of optionValues(variants, name)) if (CSS.supports("color", value.replace(/\s+/g, ""))) found.add(value);
    setCssColours(found);
  }, [names, variants]);

  // The colour picked by default shows its own photo from the start. Otherwise the page opens on the
  // product's hero photo, which is often a different colour from the one pre-selected — then picking
  // the hero's colour looks like it does nothing.
  const setSelectedImage = picked?.setSelectedImage;
  useEffect(() => {
    if (!imageOption || !setSelectedImage) return;
    const value = initialSelection(variants)[imageOption];
    const image = value ? imageForValue(variants, imageOption, value) : undefined;
    if (image) setSelectedImage(image);
  }, [imageOption, variants, setSelectedImage]);

  const usesOptions = names.length > 0;
  const selected = usesOptions ? findVariant(variants, selection) : variants.find((v) => v.id === selectedId);
  const canBuy = Boolean(selected?.inStock);

  function pick(name: string, value: string) {
    setSelection((current) => selectValue(variants, current, name, value));
    setAdded(false);
    // Picking a colour shows that colour's photo in the main gallery image.
    if (name === imageOption) {
      const image = imageForValue(variants, name, value);
      if (image) picked?.setSelectedImage(image);
    }
  }

  function addToCart() {
    if (!selected) return;
    add(selected.id, qty);
    setAdded(true);
  }

  return (
    <div className="mt-8 space-y-4">
      {usesOptions &&
        variants.length > 1 &&
        names.map((name) => {
          const values = optionValues(variants, name);
          const isImageOption = name === imageOption;
          return (
            <fieldset key={name}>
              <legend className="text-xs text-stone-500 mb-2">
                {name}: <span className="text-ink-950 font-medium">{selection[name] ?? "—"}</span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {values.map((value) => {
                  const isSelected = selection[name] === value;
                  const available = isValueAvailable(variants, selection, name, value);
                  const image = isImageOption ? imageForValue(variants, name, value) : undefined;
                  const label = `${name} ${value}${available ? "" : " (out of stock)"}`;

                  if (image) {
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => pick(name, value)}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={value}
                        className="w-16 text-center group"
                      >
                        <span
                          className={`relative block w-16 h-16 bg-stone-200 overflow-hidden border ${
                            isSelected ? "border-ink-950 ring-1 ring-ink-950" : "border-stone-300 group-hover:border-ink-700"
                          } ${available ? "" : "opacity-40"}`}
                        >
                          <Image src={image} alt="" fill sizes="64px" className="object-cover" />
                        </span>
                        <span className={`block mt-1 text-[10px] leading-tight truncate ${isSelected ? "text-ink-950" : "text-stone-500"} ${available ? "" : "line-through"}`}>
                          {value}
                        </span>
                      </button>
                    );
                  }

                  const dot = cssColours.has(value) ? value.replace(/\s+/g, "") : null;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => pick(name, value)}
                      aria-pressed={isSelected}
                      aria-label={label}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 text-sm border transition-colors ${
                        isSelected ? "bg-ink-950 text-warm-50 border-ink-950" : "border-stone-300 hover:border-ink-700"
                      } ${available ? "" : "text-stone-400 line-through"}`}
                    >
                      {dot && <span className="w-3.5 h-3.5 rounded-full border border-stone-300" style={{ backgroundColor: dot }} aria-hidden />}
                      {value}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

      {!usesOptions && variants.length > 1 && (
        <label className="block text-sm">
          <span className="block text-xs text-stone-500 mb-1">Option</span>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setAdded(false);
            }}
            className="w-full border border-stone-300 px-3 py-2 text-sm"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.inStock}>
                {v.title || v.sku || "Standard"}
                {" — "}
                {formatMoney(v.priceCents, v.currency)}
                {v.inStock ? "" : " (out of stock)"}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor="qty" className="text-sm text-stone-500">
          Quantity
        </label>
        <input
          id="qty"
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
          className="w-20 border border-stone-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button className="btn-primary flex-1 min-w-[180px]" onClick={addToCart} disabled={!canBuy}>
          {!canBuy ? "Out of Stock" : added ? "Added ✓" : "Add to Cart"}
        </button>
        {added ? (
          <Link href="/cart" className="btn-secondary flex-1 min-w-[140px] text-center">
            View Cart
          </Link>
        ) : canBuy ? (
          // Straight to checkout — "Buy Now" used to land on the cart, and added the item even when
          // the selected variant was out of stock.
          <Link href="/checkout" className="btn-secondary flex-1 min-w-[140px] text-center" onClick={addToCart}>
            Buy Now
          </Link>
        ) : null}
      </div>

      {/* The "Add to Wishlist" toggle saved nothing (wishlists need customer sign-in, not built
          yet) and "Compare" had no handler — removed rather than left as dead controls. */}
      <div className="flex gap-6 text-xs tracking-widest2 uppercase text-stone-500">
        <Link href="/compare" className="hover:text-ink-950">
          Compare products
        </Link>
      </div>

      <p className="text-xs text-stone-500">{formatMoney(selected?.priceCents ?? priceCents, selected?.currency ?? currency)}</p>
    </div>
  );
}
