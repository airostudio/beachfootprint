/**
 * The customer-facing order reference: the first 8 characters of the order's UUID, upper-cased
 * (e.g. "4D426D11"). Admin already identifies orders by this prefix, so customer, email and admin
 * all quote the same thing. It is not a secret — order lookup always pairs it with the email the
 * order was placed under.
 */
export function orderReference(orderId: string): string {
  return orderId.slice(0, 8).toUpperCase();
}

/** Normalises what a customer types ("#4d42-6d11 ", "4D426D11") to the 8-char lowercase prefix, or null. */
export function parseOrderReference(input: string): string | null {
  const cleaned = input.trim().replace(/^#/, "").replace(/[\s-]/g, "").toLowerCase();
  return /^[0-9a-f]{8}$/.test(cleaned) ? cleaned : null;
}
