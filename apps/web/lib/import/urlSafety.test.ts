import { describe, expect, it } from "vitest";
import { isBlockedFetchTarget } from "./urlSafety";

describe("isBlockedFetchTarget", () => {
  it("blocks loopback, private, link-local (incl. cloud metadata), and reserved IPv4 literals", async () => {
    const blocked = [
      "http://127.0.0.1/image.jpg",
      "http://10.0.0.5/image.jpg",
      "http://172.16.0.1/image.jpg",
      "http://172.31.255.255/image.jpg",
      "http://192.168.1.1/image.jpg",
      "http://169.254.169.254/latest/meta-data/",
      "http://0.0.0.0/image.jpg",
      "http://100.64.0.1/image.jpg",
    ];
    for (const url of blocked) {
      expect(await isBlockedFetchTarget(new URL(url)), url).toBe(true);
    }
  });

  it("blocks IPv6 loopback and unique-local literals", async () => {
    expect(await isBlockedFetchTarget(new URL("http://[::1]/image.jpg"))).toBe(true);
    expect(await isBlockedFetchTarget(new URL("http://[fd00::1]/image.jpg"))).toBe(true);
  });

  it("blocks localhost by name and non-http(s) protocols", async () => {
    expect(await isBlockedFetchTarget(new URL("http://localhost/image.jpg"))).toBe(true);
    expect(await isBlockedFetchTarget(new URL("file:///etc/passwd"))).toBe(true);
  });

  it("does not block an ordinary public IPv4 literal", async () => {
    expect(await isBlockedFetchTarget(new URL("http://93.184.216.34/image.jpg"))).toBe(false);
  });
});
