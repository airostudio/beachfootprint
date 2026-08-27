/**
 * Boho surf copy rewriter — turns a raw AliExpress listing (buzzword-laden
 * title, wall-of-text HTML description) into Beach Footprints' on-brand
 * voice: laid-back coastal, boho surf culture, sun-faded tones.
 *
 * `rewriteProductCopy` tries an injected CopyProvider (LLM) first and falls
 * back to the deterministic template rewriter below on any failure or when
 * no provider is configured — so ingestion never blocks on an external API.
 */

const BUZZWORD_PATTERNS: RegExp[] = [
  /\b20\d{2}\s*(hot\s*sale|new)\b/gi,
  /\bhot\s*sale\b/gi,
  /\bdropship(ping)?\b/gi,
  /\bwholesale\b/gi,
  /\bfree\s*shipping\b/gi,
  /\bsexy\b/gi,
  /\bbest\s*seller\b/gi,
  /\btop\s*quality\b/gi,
  /\bnew\s*arrival[s]?\b/gi,
  /\bfashion(able)?\b/gi,
  /\bplus\s*size\b/gi, // handled separately as a real attribute, not a buzzword filler phrase
  /\bfor\s*women\s*20\d{2}\b/gi,
  /!{2,}/g,
];

const COASTAL_DESCRIPTORS = ["Sun-Drenched", "Driftwood", "Tidewater", "Sagebrush Coast", "Salt-Air", "Weathered Dune"];

/** Strips dropshipping-listing buzzwords and normalizes whitespace/casing. */
export function sanitizeTitle(rawTitle: string): string {
  let title = rawTitle;
  for (const pattern of BUZZWORD_PATTERNS) title = title.replace(pattern, " ");
  title = title
    .replace(/[|/].*$/, "") // drop trailing "| Free Shipping | AliExpress"-style suffixes
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.\-–]+|[\s,.\-–]+$/g, "")
    .trim();
  return title.length > 0 ? title : rawTitle.trim();
}

/**
 * Deterministic on-brand renamer: prefixes a sanitized, title-cased product
 * name with a coastal/boho descriptor so generic supplier names read as a
 * Beach Footprints style rather than a marketplace listing. Idempotent —
 * running it twice on an already-prefixed name is a no-op.
 */
export function toOnBrandName(rawTitle: string, seed = 0): string {
  const sanitized = sanitizeTitle(rawTitle);
  if (COASTAL_DESCRIPTORS.some((d) => sanitized.startsWith(d))) return sanitized;

  const descriptor = COASTAL_DESCRIPTORS[seed % COASTAL_DESCRIPTORS.length];
  const titleCased = sanitized
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length > 2 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
  return `${descriptor} Boho Coastal ${titleCased}`.replace(/\s{2,}/g, " ").trim();
}

export interface StructuredDescription {
  theVibe: string;
  fitAndFeatures: string;
  fabricAndCare: string;
  shippingAndDelivery: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Deterministic template fallback — no external calls, always available. */
export function buildDescriptionTemplate(params: {
  onBrandName: string;
  rawDescriptionHtml?: string;
  material?: string;
  careInstructions?: string;
  estimatedDeliveryDays?: string;
}): StructuredDescription {
  const cleanedRaw = params.rawDescriptionHtml ? stripHtml(params.rawDescriptionHtml) : "";
  const excerpt = cleanedRaw.slice(0, 220).trim();

  return {
    theVibe: [
      `${params.onBrandName} is built for salt-tangled hair, bare feet, and golden-hour light.`,
      excerpt ? `${excerpt}${excerpt.length >= 220 ? "…" : ""}` : "",
    ]
      .filter(Boolean)
      .join(" "),
    fitAndFeatures: "Relaxed, easy fit designed to move with you from the sand to the boardwalk. True to size for most; size up for an even breezier drape.",
    fabricAndCare: params.material
      ? `${params.material}. ${params.careInstructions ?? "Hand wash cold or gentle machine cycle; hang to dry to keep the sun-faded finish looking right."}`
      : (params.careInstructions ?? "Hand wash cold or gentle machine cycle; hang to dry to keep the finish looking right."),
    shippingAndDelivery: params.estimatedDeliveryDays
      ? `Ships from our supplier network, typically arriving in ${params.estimatedDeliveryDays} days. Tracking is sent as soon as it's available.`
      : "Ships from our supplier network; tracking is sent to your email as soon as it's available.",
  };
}

export interface CopyRewriteRequest {
  rawTitle: string;
  rawDescriptionHtml?: string;
  material?: string;
  careInstructions?: string;
  estimatedDeliveryDays?: string;
  seed?: number;
}

export interface CopyRewriteResult {
  onBrandName: string;
  description: StructuredDescription;
  source: "llm" | "template";
}

/** Injectable hook for an LLM-backed rewriter (Claude/OpenAI). Mirrors the AIProvider pattern used elsewhere in packages/core. */
export interface CopyProvider {
  id: string;
  rewrite(request: CopyRewriteRequest): Promise<{ onBrandName: string; description: StructuredDescription }>;
}

export async function rewriteProductCopy(request: CopyRewriteRequest, provider?: CopyProvider): Promise<CopyRewriteResult> {
  if (provider) {
    try {
      const { onBrandName, description } = await provider.rewrite(request);
      return { onBrandName, description, source: "llm" };
    } catch {
      // Fall through to the offline template — ingestion must never block on the LLM being down.
    }
  }

  const onBrandName = toOnBrandName(request.rawTitle, request.seed ?? 0);
  return {
    onBrandName,
    description: buildDescriptionTemplate({ ...request, onBrandName }),
    source: "template",
  };
}

export function formatStructuredDescription(description: StructuredDescription): string {
  return [
    `The Vibe\n${description.theVibe}`,
    `Fit & Features\n${description.fitAndFeatures}`,
    `Fabric & Care\n${description.fabricAndCare}`,
    `Shipping & Delivery\n${description.shippingAndDelivery}`,
  ].join("\n\n");
}
