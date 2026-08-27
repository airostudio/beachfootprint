import { describe, expect, it } from "vitest";
import { buildDescriptionTemplate, formatStructuredDescription, rewriteProductCopy, sanitizeTitle, toOnBrandName } from "./copy";
import type { CopyProvider } from "./copy";

describe("sanitizeTitle", () => {
  it("strips dropshipping buzzwords", () => {
    const title = sanitizeTitle("2026 Hot Sale Sexy Floral Kimono Coverup Dropship Free Shipping!!");
    expect(title.toLowerCase()).not.toContain("hot sale");
    expect(title.toLowerCase()).not.toContain("dropship");
    expect(title.toLowerCase()).not.toContain("sexy");
    expect(title.toLowerCase()).not.toContain("free shipping");
  });

  it("drops marketplace suffixes after a pipe", () => {
    expect(sanitizeTitle("Boho Kimono | Free Shipping | AliExpress")).toBe("Boho Kimono");
  });
});

describe("toOnBrandName", () => {
  it("converts a generic name into a coastal/boho style", () => {
    const name = toOnBrandName("Floral Kimono Coverup");
    expect(name).toMatch(/Boho Coastal/);
    expect(name).toContain("Kimono");
  });

  it("is idempotent on an already-prefixed name", () => {
    const first = toOnBrandName("Floral Kimono Coverup", 0);
    const second = toOnBrandName(first, 0);
    expect(second).toBe(first);
  });
});

describe("buildDescriptionTemplate / formatStructuredDescription", () => {
  it("produces all four required sections", () => {
    const description = buildDescriptionTemplate({
      onBrandName: "Sun-Drenched Boho Coastal Kimono",
      rawDescriptionHtml: "<p>Beautiful floral kimono. 100% Rayon.</p>",
      material: "100% Rayon",
      estimatedDeliveryDays: "12-20",
    });
    const formatted = formatStructuredDescription(description);
    expect(formatted).toContain("The Vibe");
    expect(formatted).toContain("Fit & Features");
    expect(formatted).toContain("Fabric & Care");
    expect(formatted).toContain("Shipping & Delivery");
    expect(description.theVibe).not.toContain("<p>");
  });
});

describe("rewriteProductCopy", () => {
  it("uses the offline template when no provider is given", async () => {
    const result = await rewriteProductCopy({ rawTitle: "2026 Hot Sale Kimono Dropship" });
    expect(result.source).toBe("template");
    expect(result.onBrandName).toMatch(/Boho Coastal/);
  });

  it("falls back to the template when the LLM provider throws", async () => {
    const failingProvider: CopyProvider = {
      id: "test-llm",
      rewrite: async () => {
        throw new Error("provider unavailable");
      },
    };
    const result = await rewriteProductCopy({ rawTitle: "2026 Hot Sale Kimono Dropship" }, failingProvider);
    expect(result.source).toBe("template");
  });

  it("prefers the LLM provider's output when it succeeds", async () => {
    const provider: CopyProvider = {
      id: "test-llm",
      rewrite: async () => ({
        onBrandName: "Custom LLM Name",
        description: { theVibe: "v", fitAndFeatures: "f", fabricAndCare: "c", shippingAndDelivery: "s" },
      }),
    };
    const result = await rewriteProductCopy({ rawTitle: "anything" }, provider);
    expect(result.source).toBe("llm");
    expect(result.onBrandName).toBe("Custom LLM Name");
  });
});
