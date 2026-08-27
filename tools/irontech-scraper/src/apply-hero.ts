import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { createServiceRoleClient, resolveTenantId } from "./supabase";

const HERO_JSON_PATH = path.join(config.outputDir, "hero-slides.json");

interface ScrapedHeroSlide {
  headline: string;
  body: string;
  imageUrl: string | null;
  ctaHref: string | null;
}

/** Downloads a hero image and re-hosts it in our own product-images bucket, returning the public URL. */
async function rehostImage(supabase: ReturnType<typeof createServiceRoleClient>, tenantId: string, url: string, index: number): Promise<string | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = path.extname(new URL(url).pathname).split("?")[0] || ".jpg";
  const storagePath = `${tenantId}/hero/${index}${ext}`;
  const { error } = await supabase.storage.from("product-images").upload(storagePath, buffer, { upsert: true });
  if (error) {
    console.warn(`  hero image upload failed: ${error.message}`);
    return null;
  }
  return supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;
}

/**
 * Replaces the tenant's homepage_hero banners with the slides captured by
 * scrape.ts, after re-hosting each slide's image in our own storage (so the
 * homepage never depends on the source site staying online).
 */
async function main() {
  if (!fs.existsSync(HERO_JSON_PATH)) throw new Error(`${HERO_JSON_PATH} not found — run "pnpm scrape" first.`);
  const slides: ScrapedHeroSlide[] = JSON.parse(fs.readFileSync(HERO_JSON_PATH, "utf8"));
  if (slides.length === 0) {
    console.log("No hero slides captured — nothing to apply. (Check src/config.ts's heroSliderSelectors.)");
    return;
  }

  const supabase = createServiceRoleClient();
  const tenantId = await resolveTenantId(supabase);

  await supabase.from("banners").delete().eq("tenant_id", tenantId).eq("placement", "homepage_hero");

  const rows = [];
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    const mediaUrl = slide.imageUrl ? await rehostImage(supabase, tenantId, slide.imageUrl, i) : null;
    rows.push({
      tenant_id: tenantId,
      placement: "homepage_hero",
      headline: slide.headline || "New Arrivals",
      body: slide.body || null,
      cta_label: "Shop Now",
      cta_href: "/shop", // deliberately points into this site, not back to the source
      media_url: mediaUrl,
      media_type: "image",
      position: i,
      is_active: true,
    });
    console.log(`  ✓ slide ${i + 1}: ${slide.headline || "(no headline)"}${mediaUrl ? "" : " — no image re-hosted"}`);
  }

  const { error } = await supabase.from("banners").insert(rows);
  if (error) throw new Error(`Banner insert failed: ${error.message}`);
  console.log(`Applied ${rows.length} hero slide(s) to the homepage_hero banner set.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
