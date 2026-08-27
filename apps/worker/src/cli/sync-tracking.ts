// npm run sync:tracking
import { runTrackingSyncForAllTenants } from "../jobs/tracking-sync";

runTrackingSyncForAllTenants()
  .then((summaries) => {
    const failed = summaries.some((s) => s.errors.length > 0);
    process.exit(failed ? 1 : 0);
  })
  .catch((err) => {
    console.error("[sync:tracking] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
