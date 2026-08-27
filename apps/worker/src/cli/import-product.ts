// npm run import:aliexpress -- --id=<productId> [--tenant=<slug-or-id>] [--margin=0.35] [--publish]
import { importProductFromAliExpress } from "@trend/core/fulfillment";
import { getAliExpressClient, getDb, parseArgs, resolveTenantId } from "../lib/env";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const aliexpressProductId = args.id as string | undefined;
  if (!aliexpressProductId) {
    console.error("Usage: npm run import:aliexpress -- --id=<productId> [--tenant=<slug-or-id>] [--margin=0.35] [--publish]");
    process.exit(1);
  }

  const db = getDb();
  const client = getAliExpressClient();
  const tenantId = await resolveTenantId(db, args.tenant as string | undefined);
  const marginRate = args.margin ? Number(args.margin) : undefined;

  const result = await importProductFromAliExpress(db, client, {
    tenantId,
    aliexpressProductId,
    marginRate,
    publishNewProducts: Boolean(args.publish),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("[import:aliexpress] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
