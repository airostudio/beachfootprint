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
