import { describe, expect, it } from "vitest";
import type { ProductVariantSummary } from "./types";
import { findVariant, imageForValue, imageOptionName, initialSelection, isValueAvailable, optionNames, optionValues, selectValue } from "./variantOptions";

function v(id: string, color: string, size: string, inStock = true): ProductVariantSummary {
  return {
    id,
    title: `${color} / ${size}`,
    sku: id,
    priceCents: 2000,
    currency: "USD",
    options: [
      { name: "Color", value: color },
      { name: "Size", value: size },
    ],
    inStock,
    imageUrl: `https://img.example/${color}.jpg`,
  };
}

const variants = [v("1", "GN1", "S"), v("2", "GN1", "M", false), v("3", "RD1", "S"), v("4", "RD1", "M")];

describe("variant options", () => {
  it("lists option names and values in order", () => {
    expect(optionNames(variants)).toEqual(["Color", "Size"]);
    expect(optionValues(variants, "Color")).toEqual(["GN1", "RD1"]);
    expect(optionValues(variants, "Size")).toEqual(["S", "M"]);
  });

  it("attributes the photos to the colour option, not size", () => {
    expect(imageOptionName(variants)).toBe("Color");
    expect(imageForValue(variants, "Color", "RD1")).toBe("https://img.example/RD1.jpg");
  });

  it("has no image option when no variant has a photo", () => {
    expect(imageOptionName(variants.map((x) => ({ ...x, imageUrl: undefined })))).toBeNull();
  });

  it("starts on the first in-stock variant and finds the matching one", () => {
    const sel = initialSelection(variants);
    expect(sel).toEqual({ Color: "GN1", Size: "S" });
    expect(findVariant(variants, { Color: "RD1", Size: "M" })?.id).toBe("4");
  });

  it("reports a value unavailable when the combination is out of stock", () => {
    expect(isValueAvailable(variants, { Color: "GN1", Size: "S" }, "Size", "M")).toBe(false);
    expect(isValueAvailable(variants, { Color: "RD1", Size: "S" }, "Size", "M")).toBe(true);
  });

  it("switches other options when the picked combination doesn't exist", () => {
    const only = [v("1", "GN1", "S"), v("2", "RD1", "M")];
    expect(selectValue(only, { Color: "GN1", Size: "S" }, "Color", "RD1")).toEqual({ Color: "RD1", Size: "M" });
  });
});
