import { describe, expect, it } from "vitest";
import { completeUtf8Length } from "./utf8";

const enc = new TextEncoder();

describe("completeUtf8Length", () => {
  it("keeps a buffer that ends on a complete character", () => {
    const bytes = enc.encode("café,™");
    expect(completeUtf8Length(bytes)).toBe(bytes.length);
  });

  it("cuts before a split multi-byte character", () => {
    const full = enc.encode("ab™"); // ™ is 3 bytes
    expect(completeUtf8Length(full.slice(0, 3))).toBe(2);
    expect(completeUtf8Length(full.slice(0, 4))).toBe(2);
  });

  it("round-trips: decoding up to the cut never yields a replacement character", () => {
    const full = enc.encode("“quoted”,é,naïve\n");
    for (let end = 0; end <= full.length; end++) {
      const cut = completeUtf8Length(full.slice(0, end));
      expect(new TextDecoder().decode(full.slice(0, cut))).not.toContain("�");
    }
  });
});
