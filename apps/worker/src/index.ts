import { startAliExpressWorkers } from "./queue";

async function main() {
  if (!process.env.REDIS_URL) {
    console.log(
      "Beach Footprints worker: REDIS_URL not set, so the AliExpress catalog-sync/tracking-sync schedulers are not starting. " +
        "Set REDIS_URL and re-run, or invoke the CLI scripts directly (npm run sync:aliexpress / npm run sync:tracking) for a one-off run.",
    );
    return;
  }

  const { stop } = await startAliExpressWorkers();
  console.log("Beach Footprints worker running: catalog sync daily @ 02:00 UTC, tracking sync every 5h.");

  process.on("SIGTERM", () => void stop().then(() => process.exit(0)));
  process.on("SIGINT", () => void stop().then(() => process.exit(0)));
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
