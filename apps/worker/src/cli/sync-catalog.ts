// npm run sync:aliexpress
import { runCatalogSyncForAllTenants } from "../jobs/catalog-sync";

runCatalogSyncForAllTenants()
  .then((summaries) => {
    const failed = summaries.some((s) => s.errors.length > 0);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error("[sync:aliexpress] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
