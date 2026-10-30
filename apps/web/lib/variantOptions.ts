import type { ProductVariantSummary } from "./types";

export type Selection = Record<string, string>;

/** Option names in the order the product defines them (e.g. ["Color", "Size"]). */
export function optionNames(variants: ProductVariantSummary[]): string[] {
  const names: string[] = [];
  for (const v of variants) for (const o of v.options) if (!names.includes(o.name)) names.push(o.name);
  return names;
}

/** Distinct values of one option, in first-seen order. */
export function optionValues(variants: ProductVariantSummary[], name: string): string[] {
  const values: string[] = [];
  for (const v of variants) {
    const value = v.options.find((o) => o.name === name)?.value;
    if (value !== undefined && !values.includes(value)) values.push(value);
  }
  return values;
}

/**
 * The option the variant photos belong to — almost always the colour. It's the option where every
 * variant sharing a value has the same photo: all "GN1" variants show the green photo whatever
 * their size, while "M" variants show a different photo per colour, so Size never qualifies.
 */
export function imageOptionName(variants: ProductVariantSummary[]): string | null {
  if (!variants.some((v) => v.imageUrl)) return null;
  for (const name of optionNames(variants)) {
    const imageByValue = new Map<string, string | undefined>();
    let consistent = true;
    for (const v of variants) {
      const value = v.options.find((o) => o.name === name)?.value;
      if (value === undefined) continue;
      if (imageByValue.has(value) && imageByValue.get(value) !== v.imageUrl) {
        consistent = false;
        break;
      }
      imageByValue.set(value, v.imageUrl);
    }
    if (consistent && [...imageByValue.values()].some(Boolean)) return name;
  }
  return null;
}

export function imageForValue(variants: ProductVariantSummary[], name: string, value: string): string | undefined {
  return variants.find((v) => v.imageUrl && v.options.some((o) => o.name === name && o.value === value))?.imageUrl;
}

function matches(v: ProductVariantSummary, selection: Selection, ignore?: string): boolean {
  return Object.entries(selection).every(([name, value]) => name === ignore || v.options.find((o) => o.name === name)?.value === value);
}

export function findVariant(variants: ProductVariantSummary[], selection: Selection): ProductVariantSummary | undefined {
  return variants.find((v) => matches(v, selection));
}

/** Whether picking `value` for `name` — keeping the other current choices — leads to something in stock. */
export function isValueAvailable(variants: ProductVariantSummary[], selection: Selection, name: string, value: string): boolean {
  return variants.some((v) => v.inStock && v.options.some((o) => o.name === name && o.value === value) && matches(v, selection, name));
}

function selectionOf(v: ProductVariantSummary): Selection {
  return Object.fromEntries(v.options.map((o) => [o.name, o.value]));
}

/** The starting selection: the first in-stock variant, or the first variant if none are. */
export function initialSelection(variants: ProductVariantSummary[]): Selection {
  const start = variants.find((v) => v.inStock) ?? variants[0];
  return start ? selectionOf(start) : {};
}

/**
 * Picks `value` for `name`. If that combination doesn't exist (e.g. this colour has no size M),
 * switches the other options to the closest variant that has the value — preferring one in stock —
 * rather than leaving the shopper on a combination that can't be bought.
 */
export function selectValue(variants: ProductVariantSummary[], selection: Selection, name: string, value: string): Selection {
  const next = { ...selection, [name]: value };
  if (findVariant(variants, next)) return next;
  const withValue = variants.filter((v) => v.options.some((o) => o.name === name && o.value === value));
  const fallback = withValue.find((v) => v.inStock && matches(v, selection, name)) ?? withValue.find((v) => v.inStock) ?? withValue[0];
  return fallback ? selectionOf(fallback) : next;
}
