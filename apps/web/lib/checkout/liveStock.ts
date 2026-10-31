import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getLiveStock, type LiveStockItem } from "../dropshipEngine";
import { SUPPLIER_DROPSHIP, sellableStock } from "../stock";
import type { ResolvedLine } from "./pricing";

export interface LiveStockOutcome {
  /** False when the supplier couldn't be asked — checkout then goes ahead on the store's own stock figures. */
  checked: boolean;
  note?: string;
}

type Fetcher = (items: { aliexpressProductId: string; aliexpressSkuId: string }[]) => Promise<{ items: LiveStockItem[] }>;

const key = (productId: string, skuId: string) => `${productId}:${skuId}`;

/**
 * Checks AliExpress's live stock for every supplier item in the cart, just before payment.
 *
 * The store's own stock figures are a copy that can be hours old. Asking the supplier at the last
 * moment means a customer can't pay for a colour or size AliExpress has already sold out of — which
 * would otherwise only surface when the supplier order failed, after the money was taken.
 *
 * Marks short lines unpurchasable in place (with a reason the customer sees) and writes the fresh
 * figures back to inventory_items, so the product pages catch up too.
 *
 * Fails open: if the engine is slow, down, or doesn't support live stock yet, checkout carries on
 * with the store's own figures (still guarded by the safety buffer) rather than blocking every sale.
 */
export async function checkLiveSupplierStock(
  supabase: SupabaseClient,
  lines: ResolvedLine[],
  buffer: number,
  fetchStock: Fetcher = (items) => getLiveStock(items),
): Promise<LiveStockOutcome> {
  const supplierLines = lines.filter((l) => l.purchasable && l.supplier === SUPPLIER_DROPSHIP && l.supplierProductId && l.supplierSkuId);
  if (supplierLines.length === 0) return { checked: true };

  let result: { items: LiveStockItem[] };
  try {
    result = await fetchStock(supplierLines.map((l) => ({ aliexpressProductId: l.supplierProductId!, aliexpressSkuId: l.supplierSkuId! })));
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    console.warn(`supplier_stock_check_skipped: ${note}`);
    return { checked: false, note };
  }

  const live = new Map<string, number | null>();
  for (const item of result.items ?? []) {
    if (item.stockOnHand === undefined) continue; // couldn't be read for this one — leave the line as it was
    live.set(key(item.aliexpressProductId, item.aliexpressSkuId), item.stockOnHand === null ? null : Math.max(0, Math.floor(item.stockOnHand)));
  }

  for (const line of supplierLines) {
    const k = key(line.supplierProductId!, line.supplierSkuId!);
    if (!live.has(k)) continue;
    const stock = live.get(k) ?? 0; // null: the supplier no longer offers it
    const { error } = await supabase.from("inventory_items").update({ stock_on_hand: stock }).eq("variant_id", line.variantId);
    if (error) console.error(`supplier_stock_save_failed variant=${line.variantId}: ${error.message}`);

    const sellable = sellableStock(stock, line.supplier, buffer);
    line.stockOnHand = sellable;
    if (sellable < line.quantity) {
      line.purchasable = false;
      line.unavailableReason = sellable === 0 ? "Just sold out" : `Only ${sellable} left`;
      console.log(`supplier_stock_short variant=${line.variantId} wanted=${line.quantity} supplier=${stock} sellable=${sellable}`);
    }
  }
  return { checked: true };
}
