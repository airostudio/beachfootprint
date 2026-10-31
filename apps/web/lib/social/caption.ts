import { formatMoney } from "../format";
import type { SocialChannel } from "./meta";

export interface CaptionInput {
  title: string;
  shortDescription: string | null;
  priceCents: number | null;
  /** True when variants are priced differently, so the price reads "From $X". */
  priceVaries: boolean;
  currency: string;
  productUrl: string;
  categoryNames: string[];
}

const BRAND_TAG = "#MiraAndMuse";
const DESCRIPTION_LIMIT = 400;
const MAX_CATEGORY_TAGS = 5;
// Instagram's own limit is 2,200 characters.
const CAPTION_LIMIT = 2200;

/** "Dresses & Kimonos" -> "#DressesKimonos". Null when nothing usable is left. */
export function toHashtag(name: string): string | null {
  const words = name
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w && w.toLowerCase() !== "and");
  if (words.length === 0) return null;
  return `#${words.map((w) => w[0].toUpperCase() + w.slice(1)).join("")}`;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/**
 * The text that goes with a product's post. Facebook links straight to the product page; links in
 * Instagram captions aren't clickable, so Instagram points people at the link in the bio instead.
 */
export function buildCaption(input: CaptionInput, channel: SocialChannel): string {
  const lines: string[] = [input.title.trim()];

  const description = input.shortDescription?.replace(/\s+/g, " ").trim();
  if (description) lines.push("", truncate(description, DESCRIPTION_LIMIT));

  const price = input.priceCents !== null ? `${input.priceVaries ? "From " : ""}${formatMoney(input.priceCents, input.currency)}` : null;
  const domain = new URL(input.productUrl).host.replace(/^www\./, "");
  lines.push("");
  if (channel === "facebook") {
    if (price) lines.push(price);
    lines.push(`Shop now: ${input.productUrl}`);
  } else {
    lines.push(`${price ? `${price} · ` : ""}Shop via the link in our bio, or at ${domain}`);
  }

  const tags = [BRAND_TAG];
  for (const name of input.categoryNames) {
    const tag = toHashtag(name);
    if (tag && !tags.includes(tag) && tags.length <= MAX_CATEGORY_TAGS) tags.push(tag);
  }
  lines.push("", tags.join(" "));

  return truncate(lines.join("\n"), CAPTION_LIMIT);
}
