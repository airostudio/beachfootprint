import { describe, expect, it, vi } from "vitest";
import { AliExpressClient } from "../aliexpress/client";
import { importProductFromAliExpress, placeAliExpressOrder, pollTrackingUpdates, runDailyCatalogSync } from "./service";
import { FakeSupabase } from "./__tests__/fake-db";
import productGetFixture from "../aliexpress/__fixtures__/product-get.json";
import orderCreateFixture from "../aliexpress/__fixtures__/order-create.json";
import orderGetShippedFixture from "../aliexpress/__fixtures__/order-get-shipped.json";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const CREDENTIALS = { appKey: "k", appSecret: "s", accessToken: "a", refreshToken: "r" };
const TENANT_ID = "tenant-1";

describe("importProductFromAliExpress", () => {
  it("creates a DRAFT product with 35%-margin pricing and stock from the AliExpress detail", async () => {
    const db = new FakeSupabase() as any;
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(productGetFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const result = await importProductFromAliExpress(db, client, { tenantId: TENANT_ID, aliexpressProductId: "1005006123456" });

    const product = db.rows("products").find((p: any) => p.id === result.productId);
    expect(product.status).toBe("DRAFT");
    expect(product.title).toMatch(/Boho Coastal/);

    const variants = db.rows("product_variants");
    expect(variants).toHaveLength(2);
    const inStock = variants.find((v: any) => v.supplier_sku_id === "12000030123456789");
    expect(inStock.cost).toBe(1600); // $16.00
    expect(inStock.price).toBe(2195); // 35% margin, rounded to .95 — the spec's worked example
    expect(inStock.is_active).toBe(true);

    const outOfStock = variants.find((v: any) => v.supplier_sku_id === "12000030123456790");
    expect(outOfStock.is_active).toBe(false);

    const inventory = db.rows("inventory_items");
    expect(inventory.find((i: any) => i.variant_id === inStock.id).stock_on_hand).toBe(42);
  });
});

describe("runDailyCatalogSync", () => {
  it("logs a price change when supplier cost shifts and marks a product OUT_OF_STOCK when every variant sells out", async () => {
    const db = new FakeSupabase() as any;
    db.seed("products", [{ id: "product-1", tenant_id: TENANT_ID, status: "PUBLISHED", handle: "existing-handle" }]);
    db.seed("product_variants", [
      { id: "variant-1", product_id: "product-1", supplier: "aliexpress", supplier_product_id: "1005006123456", supplier_sku_id: "12000030123456789", sku: "AE-12000030123456789", cost: 1600, price: 2195 },
      { id: "variant-2", product_id: "product-1", supplier: "aliexpress", supplier_product_id: "1005006123456", supplier_sku_id: "12000030123456790", sku: "AE-12000030123456790", cost: 1600, price: 2195 },
    ]);

    // Both SKUs now cost more and both are sold out — a realistic "supplier raised price and ran out" tick.
    const soldOutFixture = JSON.parse(JSON.stringify(productGetFixture));
    const skuList = soldOutFixture.aliexpress_ds_product_get_response.result.ae_item_sku_info_dtos.ae_item_sku_info_d_t_o;
    skuList.forEach((sku: any) => {
      sku.sku_price = "18.00";
      sku.sku_available_stock = 0;
    });

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(soldOutFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const summary = await runDailyCatalogSync(db, client, { tenantId: TENANT_ID });

    expect(summary.priceChanges).toBe(2);
    expect(summary.productsMarkedOutOfStock).toBe(1);
    expect(db.rows("products").find((p: any) => p.id === "product-1").status).toBe("OUT_OF_STOCK");

    const priceLog = db.rows("product_price_log");
    expect(priceLog).toHaveLength(2);
    expect(priceLog[0].previous_cost).toBe(1600);
    expect(priceLog[0].new_cost).toBe(1800);
  });
});

describe("placeAliExpressOrder", () => {
  function seedOrder(db: FakeSupabase) {
    db.seed("orders", [
      {
        id: "order-1",
        tenant_id: TENANT_ID,
        fulfillment_status: "unfulfilled",
        aliexpress_order_id: null,
        shipping_address: {
          fullName: "Jamie Rivera",
          line1: "1 Ocean Ave",
          city: "Santa Cruz",
          region: "CA",
          postalCode: "95060",
          country: "US",
          phone: "+14085551234",
        },
      },
    ]);
    db.seed("product_variants", [{ id: "variant-1", supplier: "aliexpress", supplier_product_id: "1005006123456", supplier_sku_id: "12000030123456789" }]);
    db.seed("order_items", [{ id: "item-1", order_id: "order-1", variant_id: "variant-1", quantity: 2 }]);
  }

  it("places the order and stores the supplier order id", async () => {
    const db = new FakeSupabase() as any;
    seedOrder(db);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(orderCreateFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const result = await placeAliExpressOrder(db, client, { orderId: "order-1" });

    expect(result.skipped).toBe(false);
    expect(result.aliexpressOrderId).toBe("8123456789012345");
    const order = db.rows("orders")[0];
    expect(order.aliexpress_order_id).toBe("8123456789012345");
    expect(order.fulfillment_status).toBe("fulfillment_in_progress");
    expect(db.rows("fulfillment_logs").some((l: any) => l.event === "order_placed")).toBe(true);
  });

  it("is idempotent — a second call does not place a duplicate order", async () => {
    const db = new FakeSupabase() as any;
    seedOrder(db);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(orderCreateFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    await placeAliExpressOrder(db, client, { orderId: "order-1" });
    const second = await placeAliExpressOrder(db, client, { orderId: "order-1" });

    expect(second.skipped).toBe(true);
    expect(second.aliexpressOrderId).toBe("8123456789012345");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // only the first call ever hit the supplier API
  });
});

describe("pollTrackingUpdates", () => {
  it("detects a shipped transition, updates the order, and notifies once", async () => {
    const db = new FakeSupabase() as any;
    db.seed("orders", [
      { id: "order-1", tenant_id: TENANT_ID, aliexpress_order_id: "8123456789012345", fulfillment_status: "fulfillment_in_progress", tracking_number: null, status: "FULFILLING" },
    ]);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(orderGetShippedFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });
    const notify = vi.fn();

    const summary = await pollTrackingUpdates(db, client, { tenantId: TENANT_ID }, notify);

    expect(summary.shipped).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", trackingNumber: "LP00123456789CN", carrier: "AliExpress Standard Shipping" }));

    const order = db.rows("orders")[0];
    expect(order.fulfillment_status).toBe("shipped");
    expect(order.status).toBe("FULFILLED");
    expect(order.tracking_number).toBe("LP00123456789CN");
  });
});
