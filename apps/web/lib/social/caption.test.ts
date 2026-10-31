import { describe, expect, it } from "vitest";
import { buildCaption, toHashtag } from "./caption";

const base = {
  title: "High-Cut Triangle Bikini",
  shortDescription: "A clean, classic two-piece.",
  priceCents: 4995,
  priceVaries: false,
  currency: "USD",
  productUrl: "https://www.shopmiramuse.com/product/high-cut-bikini",
  categoryNames: ["Swim", "Dresses & Kimonos"],
};

describe("toHashtag", () => {
  it("joins words, drops symbols and 'and'", () => {
    expect(toHashtag("Dresses & Kimonos")).toBe("#DressesKimonos");
    expect(toHashtag("tops and t-shirts")).toBe("#TopsTShirts");
    expect(toHashtag(" & ")).toBeNull();
  });
});

describe("buildCaption", () => {
  it("links to the product on Facebook", () => {
    const caption = buildCaption(base, "facebook");
    expect(caption).toContain("High-Cut Triangle Bikini");
    expect(caption).toContain("$49.95");
    expect(caption).toContain("Shop now: https://www.shopmiramuse.com/product/high-cut-bikini");
    expect(caption).toContain("#MiraAndMuse #Swim #DressesKimonos");
  });

  it("points Instagram at the bio link, since caption links aren't clickable there", () => {
    const caption = buildCaption(base, "instagram");
    expect(caption).not.toContain("https://");
    expect(caption).toContain("$49.95 · Shop via the link in our bio, or at shopmiramuse.com");
  });

  it("says 'From' when variants are priced differently, and copes with no price or description", () => {
    expect(buildCaption({ ...base, priceVaries: true }, "facebook")).toContain("From $49.95");
    const bare = buildCaption({ ...base, priceCents: null, shortDescription: null }, "instagram");
    expect(bare).toContain("Shop via the link in our bio");
    expect(bare).not.toContain("$");
  });

  it("shortens long descriptions and stays within Instagram's limit", () => {
    const caption = buildCaption({ ...base, shortDescription: "word ".repeat(1000) }, "instagram");
    expect(caption.length).toBeLessThanOrEqual(2200);
    expect(caption).toContain("…");
  });
});
