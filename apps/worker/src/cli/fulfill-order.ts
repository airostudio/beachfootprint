// npm run fulfill:aliexpress -- --order-id=<localOrderId>
import { placeAliExpressOrder } from "@trend/core";
import { getAliExpressClient, getDb, parseArgs } from "../lib/env";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orderId = (args["order-id"] as string | undefined) ?? (args.orderId as string | undefined);
  if (!orderId) {
    console.error("Usage: npm run fulfill:aliexpress -- --order-id=<localOrderId>");
    process.exit(1);
  }

  const db = getDb();
  const client = getAliExpressClient();
  const result = await placeAliExpressOrder(db, client, { orderId });

  console.log(JSON.stringify(result, null, 2));
  if (result.skipped) console.log("Order was already placed or is not eligible for placement — no action taken.");
}

main().catch((err) => {
  console.error("[fulfill:aliexpress] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
