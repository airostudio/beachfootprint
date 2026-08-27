import { runDailyCatalogSync } from "@trend/core/fulfillment";
import type { CatalogSyncSummary } from "@trend/core/fulfillment";
import { getAliExpressClient, getDb, listTenantIds } from "../lib/env";

/** Runs the daily AliExpress catalog reconciliation for every tenant. Scheduled at 02:00 UTC — see queue.ts. */
export async function runCatalogSyncForAllTenants(): Promise<CatalogSyncSummary[]> {
  const db = getDb();
  const client = getAliExpressClient();
  const tenantIds = await listTenantIds(db);

  const summaries: CatalogSyncSummary[] = [];
  for (const tenantId of tenantIds) {
    const summary = await runDailyCatalogSync(db, client, { tenantId });
    summaries.push(summary);
    console.log(
      `[catalog-sync] tenant=${tenantId} checked=${summary.productsChecked} reconciled=${summary.variantsReconciled} ` +
        `priceChanges=${summary.priceChanges} outOfStock=${summary.productsMarkedOutOfStock} restocked=${summary.productsRestocked} ` +
        `errors=${summary.errors.length}`,
    );
  }
  return summaries;
}
