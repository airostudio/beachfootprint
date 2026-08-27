/**
 * 35% margin pricing engine. All money is integer minor units (cents), same
 * convention as product_variants.price/cost throughout the schema.
 */

export const DEFAULT_MARGIN_RATE = 0.35;

export interface RetailPriceResult {
  supplierCostCents: number;
  marginRate: number;
  /** Cost * (1 + marginRate), before psychological rounding. */
  rawRetailCents: number;
  retailPriceCents: number;
}

/**
 * Rounds a price up to the nearest `.95`, unless it's already a whole
 * dollar amount (`.00`), in which case it's left alone. Never rounds down —
 * that would erode the target margin.
 */
export function psychologicalRoundUp(cents: number): number {
  if (cents <= 0) return 0;
  if (cents % 100 === 0) return cents;

  const dollars = Math.floor(cents / 100);
  const ninetyFive = dollars * 100 + 95;
  return cents <= ninetyFive ? ninetyFive : (dollars + 1) * 100 + 95;
}

export function calculateRetailPrice(supplierCostCents: number, marginRate: number = DEFAULT_MARGIN_RATE): RetailPriceResult {
  if (supplierCostCents < 0) throw new Error("supplierCostCents must be >= 0");
  if (marginRate < 0) throw new Error("marginRate must be >= 0");

  const rawRetailCents = Math.round(supplierCostCents * (1 + marginRate));
  return {
    supplierCostCents,
    marginRate,
    rawRetailCents,
    retailPriceCents: psychologicalRoundUp(rawRetailCents),
  };
}

export interface PriceChange {
  variantId: string;
  previousCostCents: number | null;
  newCostCents: number;
  previousPriceCents: number | null;
  newPriceCents: number;
  marginRate: number;
  changed: boolean;
}

/** Compares a variant's stored cost/price against a freshly-fetched supplier cost, for the daily sync's price-log step. */
export function diffPriceChange(params: {
  variantId: string;
  previousCostCents: number | null;
  previousPriceCents: number | null;
  newSupplierCostCents: number;
  marginRate?: number;
}): PriceChange {
  const marginRate = params.marginRate ?? DEFAULT_MARGIN_RATE;
  const { retailPriceCents } = calculateRetailPrice(params.newSupplierCostCents, marginRate);
  return {
    variantId: params.variantId,
    previousCostCents: params.previousCostCents,
    newCostCents: params.newSupplierCostCents,
    previousPriceCents: params.previousPriceCents,
    newPriceCents: retailPriceCents,
    marginRate,
    changed: params.previousCostCents !== params.newSupplierCostCents,
  };
}
