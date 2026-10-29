import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/import/rehostImages", () => ({ rehostImages: vi.fn() }));
const { normalizeStatus } = await import("./product-import");

describe("normalizeStatus", () => {
  it("defaults an empty status to PUBLISHED", () => {
    expect(normalizeStatus(undefined)).toBe("PUBLISHED");
    expect(normalizeStatus("  ")).toBe("PUBLISHED");
  });
  it("understands common export values", () => {
    expect(normalizeStatus("active")).toBe("PUBLISHED");
    expect(normalizeStatus("TRUE")).toBe("PUBLISHED");
    expect(normalizeStatus("Published")).toBe("PUBLISHED");
    expect(normalizeStatus("archived")).toBe("ARCHIVED");
    expect(normalizeStatus("draft")).toBe("DRAFT");
    expect(normalizeStatus("FALSE")).toBe("DRAFT");
  });
  it("lands anything unrecognised as DRAFT instead of failing the insert", () => {
    expect(normalizeStatus("pending-review")).toBe("DRAFT");
  });
});
