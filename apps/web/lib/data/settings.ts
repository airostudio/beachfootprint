import "server-only";
import { db, getTenantId } from "./client";

/**
 * The currency the store sells in. Owned by this database (tenant_settings.base_currency, which
 * defaults to USD), so an unconfigured store is definitively priced in USD rather than inheriting
 * whatever an external service defaults to. Change it in Admin → Payments.
 */
export async function getStoreCurrency(): Promise<string> {
  const tenantId = await getTenantId();
  const { data } = await db().from("tenant_settings").select("base_currency").eq("tenant_id", tenantId).maybeSingle();
  return (data?.base_currency as string | undefined) ?? "USD";
}

export interface StoreContactSettings {
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
}

/**
 * Contact details for the policy pages. Read from settings rather than written into the policy
 * text so they stay correct when they change — and so nothing invents an address the store
 * doesn't have. Missing values fall back to pointing at the support page.
 */
export async function getStoreSettings(): Promise<StoreContactSettings> {
  const tenantId = await getTenantId();
  const { data } = await db()
    .from("tenant_settings")
    .select("contact_email, contact_phone, contact_address")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    contactEmail: (data?.contact_email as string | undefined) ?? null,
    contactPhone: (data?.contact_phone as string | undefined) ?? null,
    contactAddress: (data?.contact_address as string | undefined) ?? null,
  };
}

/**
 * The free-shipping threshold as checkout actually applies it, formatted for display — or null if
 * shipping is never free. The footer used to hardcode "Free shipping over $75" while checkout's
 * real (configurable) threshold defaulted to $100. Never throws: the root layout renders this.
 */
export async function getFreeShippingNote(): Promise<string | null> {
  try {
    const tenantId = await getTenantId();
    const { data } = await db()
      .from("tenant_settings")
      .select("free_shipping_threshold_cents, shipping_flat_rate_cents, base_currency")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const flat = (data?.shipping_flat_rate_cents as number | null | undefined) ?? null;
    if (flat === 0) return "Free shipping on every order.";
    const threshold = (data?.free_shipping_threshold_cents as number | null | undefined) ?? 10000; // mirrors pricing.ts default
    if (!threshold || threshold <= 0) return "Free shipping on every order.";
    const currency = ((data?.base_currency as string | undefined) ?? "USD").toUpperCase();
    return `Free shipping over ${new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(threshold / 100)}.`;
  } catch {
    return null;
  }
}
