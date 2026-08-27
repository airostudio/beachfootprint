import { describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { AliExpressApiError, AliExpressClient } from "./client";
import productGetFixture from "./__fixtures__/product-get.json";
import orderCreateFixture from "./__fixtures__/order-create.json";
import orderGetShippedFixture from "./__fixtures__/order-get-shipped.json";
import orderGetUnshippedFixture from "./__fixtures__/order-get-unshipped.json";
import trackingQueryFixture from "./__fixtures__/tracking-query.json";
import expiredTokenFixture from "./__fixtures__/error-expired-token.json";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const CREDENTIALS = { appKey: "app-key", appSecret: "app-secret", accessToken: "access-token", refreshToken: "refresh-token" };

describe("AliExpressClient signing", () => {
  it("signs sorted key+value params with HMAC-SHA256, uppercase hex", () => {
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl: vi.fn() });
    const params = { method: "aliexpress.ds.product.get", app_key: "app-key", product_id: "123" };
    const expected = createHmac("sha256", "app-secret")
      .update(
        Object.keys(params)
          .sort()
          .map((k) => `${k}${(params as Record<string, string>)[k]}`)
          .join(""),
        "utf8",
      )
      .digest("hex")
      .toUpperCase();
    expect(client.sign(params)).toBe(expected);
  });
});

describe("AliExpressClient.getProductDetail", () => {
  it("normalizes the nested gateway response into AliExpressProductDetail", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(productGetFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const detail = await client.getProductDetail("1005006123456");

    expect(detail.product_id).toBe("1005006123456");
    expect(detail.subject).toContain("Kimono");
    expect(detail.ae_item_sku_info_dtos).toHaveLength(2);
    expect(detail.ae_item_sku_info_dtos[0].sku_price).toBe("16.00");
    expect(detail.ae_item_sku_info_dtos[0].sku_available_stock).toBe(42);
    expect(detail.ae_item_sku_info_dtos[1].sku_available_stock).toBe(0);
  });

  it("refreshes the access token once and retries on an expired-token error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(expiredTokenFixture))
      .mockResolvedValueOnce(jsonResponse({ access_token: "new-token", refresh_token: "new-refresh", expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(productGetFixture));
    const onTokenRefreshed = vi.fn();
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl, onTokenRefreshed });

    const detail = await client.getProductDetail("1005006123456");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onTokenRefreshed).toHaveBeenCalledWith(expect.objectContaining({ accessToken: "new-token", refreshToken: "new-refresh" }));
    expect(detail.product_id).toBe("1005006123456");
  });

  it("throws AliExpressApiError for a non-token error without retrying", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ error_response: { code: "15", sub_code: "isv.business-error", msg: "biz", sub_msg: "product not found" } }),
    );
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    await expect(client.getProductDetail("missing")).rejects.toBeInstanceOf(AliExpressApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("AliExpressClient.createOrder", () => {
  it("returns the supplier order id on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(orderCreateFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const result = await client.createOrder({
      outOrderId: "local-order-1",
      logisticsAddress: {
        contactPerson: "Jamie Rivera",
        fullName: "Jamie Rivera",
        address: "1 Ocean Ave",
        city: "Santa Cruz",
        province: "CA",
        zip: "95060",
        country: "US",
        mobileNo: "+14085551234",
      },
      items: [{ productId: "1005006123456", skuId: "12000030123456789", quantity: 1, logisticsServiceName: "CAINIAO_STANDARD" }],
    });

    expect(result.orderId).toBe("8123456789012345");
    expect(result.outOrderId).toBe("local-order-1");
  });
});

describe("AliExpressClient.getOrderDetail", () => {
  it("extracts tracking info once shipped", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(orderGetShippedFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const detail = await client.getOrderDetail("8123456789012345");

    expect(detail.logistics_info_list?.[0].logistics_no).toBe("LP00123456789CN");
    expect(detail.logistics_info_list?.[0].logistics_company).toBe("AliExpress Standard Shipping");
  });

  it("returns no logistics info before the seller ships", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(orderGetUnshippedFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const detail = await client.getOrderDetail("8123456789012345");

    expect(detail.order_status).toBe("WAIT_SELLER_SEND_GOODS");
    expect(detail.logistics_info_list).toHaveLength(0);
  });
});

describe("AliExpressClient.queryTrackingInfo", () => {
  it("normalizes tracking events", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(trackingQueryFixture));
    const client = new AliExpressClient({ ...CREDENTIALS, fetchImpl });

    const tracking = await client.queryTrackingInfo({ orderId: "8123456789012345" });

    expect(tracking.logisticsNo).toBe("LP00123456789CN");
    expect(tracking.events).toHaveLength(2);
    expect(tracking.events[1].location).toBe("Los Angeles, US");
  });
});
