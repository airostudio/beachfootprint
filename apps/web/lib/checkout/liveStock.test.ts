import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkLiveSupplierStock } from "./liveStock";
import type { ResolvedLine } from "./pricing";

function line(overrides: Partial<ResolvedLine> = {}): ResolvedLine {
  return {
    variantId: "v1",
    productId: "p1",
    handle: "h",
    title: "Bikini",
    variantTitle: "GN1 / S",
    sku: "s",
    imageUrl: null,
    unitPriceCents: 4995,
    quantity: 1,
    lineTotalCents: 4995,
    currency: "USD",
    stockOnHand: 20,
    supplier: "dropship-engine",
    supplierProductId: "AE1",
    supplierSkuId: "SKU1",
    purchasable: true,
    unavailableReason: null,
    ...overrides,
  };
}

function fakeSupabase() {
  const updates: { stock: number; variantId: string }[] = [];
  const supabase = {
    from: () => ({
      update: (fields: { stock_on_hand: number }) => ({
        eq: async (_col: string, variantId: string) => {
          updates.push({ stock: fields.stock_on_hand, variantId });
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
  return { supabase, updates };
}

describe("checkLiveSupplierStock", () => {
  it("blocks a line the supplier has just sold out of, and saves the live figure", async () => {
    const { supabase, updates } = fakeSupabase();
    const lines = [line()];
    const outcome = await checkLiveSupplierStock(supabase, lines, 2, async () => ({
      items: [{ aliexpressProductId: "AE1", aliexpressSkuId: "SKU1", stockOnHand: 1 }],
    }));
    expect(outcome.checked).toBe(true);
    expect(lines[0].purchasable).toBe(false);
    expect(lines[0].unavailableReason).toBe("Just sold out");
    expect(updates).toEqual([{ stock: 1, variantId: "v1" }]);
  });

  it("says how many are left when the supplier has fewer than wanted", async () => {
    const { supabase } = fakeSupabase();
    const lines = [line({ quantity: 5 })];
    await checkLiveSupplierStock(supabase, lines, 2, async () => ({ items: [{ aliexpressProductId: "AE1", aliexpressSkuId: "SKU1", stockOnHand: 5 }] }));
    expect(lines[0].unavailableReason).toBe("Only 3 left");
  });

  it("treats a SKU the supplier no longer offers as sold out", async () => {
    const { supabase, updates } = fakeSupabase();
    const lines = [line()];
    await checkLiveSupplierStock(supabase, lines, 2, async () => ({ items: [{ aliexpressProductId: "AE1", aliexpressSkuId: "SKU1", stockOnHand: null }] }));
    expect(lines[0].purchasable).toBe(false);
    expect(updates[0].stock).toBe(0);
  });

  it("lets plenty of stock through", async () => {
    const { supabase } = fakeSupabase();
    const lines = [line({ quantity: 2 })];
    await checkLiveSupplierStock(supabase, lines, 2, async () => ({ items: [{ aliexpressProductId: "AE1", aliexpressSkuId: "SKU1", stockOnHand: 400 }] }));
    expect(lines[0].purchasable).toBe(true);
  });

  it("carries on with the store's own figures when the supplier can't be reached", async () => {
    const { supabase, updates } = fakeSupabase();
    const lines = [line()];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const outcome = await checkLiveSupplierStock(supabase, lines, 2, async () => {
      throw new Error("Engine request failed (404)");
    });
    expect(outcome.checked).toBe(false);
    expect(lines[0].purchasable).toBe(true);
    expect(updates).toEqual([]);
  });

  it("doesn't ask the supplier about the store's own stock", async () => {
    const { supabase } = fakeSupabase();
    const fetcher = vi.fn();
    await checkLiveSupplierStock(supabase, [line({ supplier: null })], 2, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
