import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { PRODUCT_CSV_COLUMNS, parseCsvRows, rowsToCsv, type ProductCsvRow } from "./csv";
import { createServiceRoleClient, resolveTenantId } from "./supabase";

const PRODUCTS_CSV_PATH = path.join(config.outputDir, "products.csv");

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

/**
 * Re-hosts every locally-downloaded product image in our own Supabase
 * Storage (`product-images`, public bucket) and rewrites products.csv's
 * image_urls column from local file paths to the resulting public URLs, so
 * the CSV is then ready to hand straight to /admin/products/import.
 * Idempotent: any image_urls entry that's already an http(s) URL is left
 * alone, so re-running after a partial failure only uploads what's missing.
 */
async function main() {
  if (!fs.existsSync(PRODUCTS_CSV_PATH)) throw new Error(`${PRODUCTS_CSV_PATH} not found — run "pnpm scrape" first.`);

  const supabase = createServiceRoleClient();
  const tenantId = await resolveTenantId(supabase);

  const parsed = parseCsvRows(fs.readFileSync(PRODUCTS_CSV_PATH, "utf8"));
  const [, ...dataRows] = parsed;
  const rows: ProductCsvRow[] = dataRows.map((cells) => Object.fromEntries(PRODUCT_CSV_COLUMNS.map((c, i) => [c, cells[i] ?? ""])) as ProductCsvRow);

  for (const row of rows) {
    if (!row.image_urls) continue;
    const entries = row.image_urls.split("|").map((s) => s.trim()).filter(Boolean);
    const finalUrls: string[] = [];

    for (const entry of entries) {
      if (/^https?:\/\//.test(entry)) {
        finalUrls.push(entry); // already uploaded on a prior run
        continue;
      }
      if (!fs.existsSync(entry)) {
        console.warn(`  missing local file, skipping: ${entry}`);
        continue;
      }
      const filename = path.basename(entry);
      const storagePath = `${tenantId}/${row.handle}/${filename}`;
      const buffer = fs.readFileSync(entry);
      const { error } = await supabase.storage
        .from("product-images")
        .upload(storagePath, buffer, { contentType: contentTypeFor(entry), upsert: true });
      if (error) {
        console.warn(`  upload failed for ${entry}: ${error.message}`);
        continue;
      }
      const { data } = supabase.storage.from("product-images").getPublicUrl(storagePath);
      finalUrls.push(data.publicUrl);
      console.log(`  ✓ ${row.handle}/${filename}`);
    }
    row.image_urls = finalUrls.join(",");
  }

  fs.writeFileSync(PRODUCTS_CSV_PATH, rowsToCsv(rows));
  console.log(`Rewrote ${PRODUCTS_CSV_PATH} with hosted image URLs. Ready for /admin/products/import.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
