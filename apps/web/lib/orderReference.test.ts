import { describe, expect, it } from "vitest";
import { orderReference, parseOrderReference } from "./orderReference";

describe("orderReference", () => {
  it("is the upper-cased 8-char prefix of the order id", () => {
    expect(orderReference("4d426d11-a44b-447d-a0ae-7bd12d4d5130")).toBe("4D426D11");
  });

  it("parses what a customer is likely to type", () => {
    expect(parseOrderReference("4D426D11")).toBe("4d426d11");
    expect(parseOrderReference(" #4d42-6d11 ")).toBe("4d426d11");
  });

  it("rejects anything that isn't an 8-hex-char reference", () => {
    expect(parseOrderReference("ORD-10231")).toBeNull();
    expect(parseOrderReference("4d426d1")).toBeNull();
    expect(parseOrderReference("")).toBeNull();
  });
});
