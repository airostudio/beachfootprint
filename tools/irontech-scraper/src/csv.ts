export const PRODUCT_CSV_COLUMNS = [
  "handle", "title", "product_type", "short_description", "description",
  "price", "compare_at", "sku", "stock_on_hand", "category_handles",
  "brand", "material", "height_cm", "status", "image_urls",
] as const;

export type ProductCsvRow = Record<(typeof PRODUCT_CSV_COLUMNS)[number], string>;

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function rowsToCsv(rows: ProductCsvRow[]): string {
  const lines = [PRODUCT_CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(PRODUCT_CSV_COLUMNS.map((col) => escapeCsvField(row[col] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Minimal quoted-CSV row parser (handles embedded commas/newlines and ""
 * escaping) — reads a whole already-on-disk file at once, which is fine
 * here since this only ever re-parses this tool's own prior output for
 * resuming an interrupted run, not the (potentially huge) source data.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\r") {
      // skip
    } else if (ch === "\n") {
      pushRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
