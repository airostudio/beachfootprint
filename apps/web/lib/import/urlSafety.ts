import "server-only";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

/**
 * Blocks fetches to private, loopback, or link-local addresses — including cloud metadata
 * endpoints like 169.254.169.254 — so an "image URL" from a CSV row or an AliExpress listing
 * can't turn the server into a probe against its own internal network. Both the hostname's own
 * literal form (an attacker can just write the IP directly) and what it resolves to via DNS (an
 * attacker-controlled domain can point anywhere) are checked, since checking only one lets the
 * other through.
 */
export async function isBlockedFetchTarget(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;

  // WHATWG URL keeps the brackets on an IPv6 host ("[::1]") — net.isIP doesn't recognize that
  // form, so without stripping them here an IPv6 literal would fall through to the DNS-lookup
  // branch below and try (and fail) to resolve "[::1]" as a hostname instead of being recognized
  // as the loopback address it already is.
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;

  if (isIP(hostname)) return isPrivateOrReservedIp(hostname);

  try {
    const { address } = await lookup(hostname);
    return isPrivateOrReservedIp(address);
  } catch {
    // Can't resolve it, so it can't be fetched either — not a bypass, just let the caller's own
    // fetch fail with its normal DNS error and reason string.
    return false;
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return a === "::1" || a.startsWith("fe80:") || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("::ffff:127.");
  }

  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => Number.isNaN(n))) return true;
  const [a, b] = octets;

  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 0) return true; // "this network"
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}
