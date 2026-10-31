/**
 * AliExpress size charts arrive as a spec row whose value is raw JSON —
 * {"sizeInfoList":[{"size":"S","length":{"cm":"68-84","inch":"26.77-33.07"},"vid":100014064}, …]} —
 * which the Specifications tab used to print verbatim. This turns it into a table.
 */

export interface SizeMeasure {
  cm: string | null;
  inch: string | null;
}

export interface SizeChart {
  /** Measurement columns, in the order the supplier gave them (e.g. Length, Bust, Waist). */
  measures: { key: string; label: string }[];
  rows: { size: string; values: Record<string, SizeMeasure> }[];
}

const LABELS: Record<string, string> = {
  length: "Length",
  bust: "Bust",
  chest: "Chest",
  waist: "Waist",
  hip: "Hip",
  hips: "Hip",
  shoulder: "Shoulder",
  sleeve: "Sleeve",
  sleevelength: "Sleeve length",
  thigh: "Thigh",
  inseam: "Inseam",
  height: "Height",
  weight: "Weight",
};

/** Keys that identify the row, not a measurement. */
const NOT_MEASURES = new Set(["size", "vid", "id", "sizeid", "sizename"]);

function labelFor(key: string): string {
  const known = LABELS[key.toLowerCase().replace(/[^a-z]/g, "")];
  if (known) return known;
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "68-84" -> "68–84"; trims and drops empty values. */
function tidy(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim().replace(/\s*-\s*/g, "–");
  return text ? text : null;
}

function measureOf(value: unknown): SizeMeasure | null {
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const cm = tidy(v.cm ?? v.CM);
    const inch = tidy(v.inch ?? v.in ?? v.INCH);
    return cm || inch ? { cm, inch } : null;
  }
  const plain = tidy(value);
  return plain ? { cm: plain, inch: null } : null;
}

/** Null when the value isn't a usable size chart. */
export function parseSizeChart(raw: string): SizeChart | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const list = Array.isArray(data) ? data : (data as { sizeInfoList?: unknown })?.sizeInfoList;
  if (!Array.isArray(list)) return null;

  const measures: SizeChart["measures"] = [];
  const rows: SizeChart["rows"] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    const size = tidy(item.size ?? item.sizeName);
    if (!size || rows.some((r) => r.size === size)) continue;

    const values: Record<string, SizeMeasure> = {};
    for (const [key, value] of Object.entries(item)) {
      if (NOT_MEASURES.has(key.toLowerCase())) continue;
      const measure = measureOf(value);
      if (!measure) continue;
      values[key] = measure;
      if (!measures.some((m) => m.key === key)) measures.push({ key, label: labelFor(key) });
    }
    rows.push({ size, values });
  }

  return rows.length > 0 && measures.length > 0 ? { measures, rows } : null;
}

/** Raw JSON in a spec value is never something to show a customer. */
export function looksLikeJson(value: string): boolean {
  const v = value.trim();
  return (v.startsWith("{") && v.endsWith("}")) || (v.startsWith("[") && v.endsWith("]"));
}
