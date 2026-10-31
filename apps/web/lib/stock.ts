/** The supplier value on product_variants for AliExpress products bought through the dropship engine. */
export const SUPPLIER_DROPSHIP = "dropship-engine";

/** Units held back from AliExpress stock by default (tenant_settings.supplier_stock_buffer). */
export const DEFAULT_SUPPLIER_STOCK_BUFFER = 2;

/**
 * How many units a shopper can actually buy.
 *
 * Stock this store holds itself is exact. Supplier stock is a copy of AliExpress's figure that can
 * be hours old, and other stores sell from the same pool — so a few units are held back, and a
 * colour or size reads as sold out once the supplier is down to its last couple. That leaves
 * headroom for the gap between syncs instead of selling the very last unit twice.
 */
export function sellableStock(stockOnHand: number, supplier: string | null | undefined, buffer: number): number {
  const stock = Math.max(0, stockOnHand);
  if (supplier !== SUPPLIER_DROPSHIP) return stock;
  return Math.max(0, stock - Math.max(0, buffer));
}

export function bufferOrDefault(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_SUPPLIER_STOCK_BUFFER;
}
