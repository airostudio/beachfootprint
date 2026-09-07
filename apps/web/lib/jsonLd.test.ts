import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./jsonLd";

describe("safeJsonLd", () => {
  it("escapes </script> so an attacker-controlled string can't close the tag", () => {
    const payload = { name: "</script><script>alert(1)</script>" };
    const out = safeJsonLd(payload);
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c/script>");
  });

  it("round-trips to the same value once parsed back", () => {
    const payload = { name: "</script>", price: "12.00" };
    expect(JSON.parse(safeJsonLd(payload))).toEqual(payload);
  });

  it("leaves ordinary content unchanged", () => {
    const payload = { name: "Bamboo Beach Mat" };
    expect(safeJsonLd(payload)).toBe(JSON.stringify(payload));
  });
});
