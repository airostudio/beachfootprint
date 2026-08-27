import { describe, expect, it } from "vitest";
import { calculateRetailPrice, diffPriceChange, psychologicalRoundUp } from "./pricing";

describe("psychologicalRoundUp", () => {
  it("rounds up to the nearest .95", () => {
    expect(psychologicalRoundUp(2160)).toBe(2195); // $21.60 -> $21.95, matches the spec example
    expect(psychologicalRoundUp(101)).toBe(195);
  });

  it("leaves whole-dollar amounts alone", () => {
    expect(psychologicalRoundUp(2000)).toBe(2000);
  });

  it("does not round a value already at .95", () => {
    expect(psychologicalRoundUp(1995)).toBe(1995);
  });

  it("treats zero/negative as zero", () => {
    expect(psychologicalRoundUp(0)).toBe(0);
    expect(psychologicalRoundUp(-50)).toBe(0);
  });
});

describe("calculateRetailPrice", () => {
  it("applies the default 35% margin and psychological rounding", () => {
    // $16.00 supplier cost * 1.35 = $21.60 -> $21.95, the spec's worked example
    const result = calculateRetailPrice(1600);
    expect(result.marginRate).toBe(0.35);
    expect(result.rawRetailCents).toBe(2160);
    expect(result.retailPriceCents).toBe(2195);
  });

  it("supports a custom margin rate", () => {
    const result = calculateRetailPrice(1000, 0.5);
    expect(result.rawRetailCents).toBe(1500);
    expect(result.retailPriceCents).toBe(1500); // already a whole dollar
  });

  it("rejects negative cost", () => {
    expect(() => calculateRetailPrice(-1)).toThrow();
  });
});

describe("diffPriceChange", () => {
  it("flags a change when supplier cost moved and recomputes retail price", () => {
    const diff = diffPriceChange({
      variantId: "v1",
      previousCostCents: 1600,
      previousPriceCents: 2195,
      newSupplierCostCents: 1800,
    });
    expect(diff.changed).toBe(true);
    expect(diff.newPriceCents).toBe(calculateRetailPrice(1800).retailPriceCents);
  });

  it("reports no change when supplier cost is identical", () => {
    const diff = diffPriceChange({
      variantId: "v1",
      previousCostCents: 1600,
      previousPriceCents: 2195,
      newSupplierCostCents: 1600,
    });
    expect(diff.changed).toBe(false);
  });
});
