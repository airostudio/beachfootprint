import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { runCatalogSyncForAllTenants } from "./jobs/catalog-sync";
import { runTrackingSyncForAllTenants } from "./jobs/tracking-sync";

const CATALOG_SYNC_QUEUE = "aliexpress-catalog-sync";
const TRACKING_SYNC_QUEUE = "aliexpress-tracking-sync";

function connectionFromEnv(): ConnectionOptions {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required to run the AliExpress sync workers");
  return { url } as unknown as ConnectionOptions;
}

/**
 * Registers the two scheduled AliExpress jobs on BullMQ's repeatable-job
 * scheduler: catalog reconciliation daily at 02:00 UTC, tracking polling
 * every 5 hours (within the spec's 4-6 hour window). Call once per process.
 */
export async function startAliExpressWorkers(): Promise<{ stop: () => Promise<void> }> {
  const connection = connectionFromEnv();

  const catalogSyncQueue = new Queue(CATALOG_SYNC_QUEUE, { connection });
  const trackingSyncQueue = new Queue(TRACKING_SYNC_QUEUE, { connection });

  await catalogSyncQueue.add(
    "daily-sync",
    {},
    { repeat: { pattern: "0 2 * * *" }, removeOnComplete: 20, removeOnFail: 50 },
  );
  await trackingSyncQueue.add(
    "poll-tracking",
    {},
    { repeat: { pattern: "0 */5 * * *" }, removeOnComplete: 20, removeOnFail: 50 },
  );

  const catalogSyncWorker = new Worker(CATALOG_SYNC_QUEUE, () => runCatalogSyncForAllTenants(), { connection });
  const trackingSyncWorker = new Worker(TRACKING_SYNC_QUEUE, () => runTrackingSyncForAllTenants(), { connection });

  catalogSyncWorker.on("failed", (job, err) => console.error(`[catalog-sync] job ${job?.id} failed:`, err));
  trackingSyncWorker.on("failed", (job, err) => console.error(`[tracking-sync] job ${job?.id} failed:`, err));

  return {
    stop: async () => {
      await Promise.all([catalogSyncWorker.close(), trackingSyncWorker.close(), catalogSyncQueue.close(), trackingSyncQueue.close()]);
    },
  };
}
