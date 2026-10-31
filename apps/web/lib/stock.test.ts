import { describe, expect, it } from "vitest";
import { bufferOrDefault, sellableStock } from "./stock";

describe("sellableStock", () => {
  it("holds units back from AliExpress stock", () => {
    expect(sellableStock(10, "dropship-engine", 2)).toBe(8);
    expect(sellableStock(3, "dropship-engine", 2)).toBe(1);
    expect(sellableStock(2, "dropship-engine", 2)).toBe(0);
    expect(sellableStock(0, "dropship-engine", 2)).toBe(0);
  });

  it("leaves the store's own stock exact", () => {
    expect(sellableStock(2, null, 2)).toBe(2);
    expect(sellableStock(1, "manual", 5)).toBe(1);
  });

  it("never goes negative", () => {
    expect(sellableStock(-4, null, 2)).toBe(0);
    expect(sellableStock(5, "dropship-engine", -3)).toBe(5);
  });
});

describe("bufferOrDefault", () => {
  it("falls back to 2 when the setting is missing or invalid", () => {
    expect(bufferOrDefault(undefined)).toBe(2);
    expect(bufferOrDefault(null)).toBe(2);
    expect(bufferOrDefault(-1)).toBe(2);
    expect(bufferOrDefault(0)).toBe(0);
    expect(bufferOrDefault(5)).toBe(5);
  });
});
