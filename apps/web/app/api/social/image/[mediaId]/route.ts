import { db } from "@/lib/data/client";
import { isDisplayableImageUrl } from "@/lib/import/imageUrls";
import { instagramJpeg } from "@/lib/social/instagramImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Serves a product photo as an Instagram-ready JPEG. Public, because Instagram fetches the photo
 * itself from the URL it's given when a post is created.
 *
 * Takes a product_media id, never a URL, so it can only ever serve the photos of a published
 * product in this store — it can't be used to fetch or resize arbitrary images.
 */
export async function GET(_request: Request, { params }: { params: { mediaId: string } }) {
  if (!UUID.test(params.mediaId)) return new Response("Not found", { status: 404 });

  const { data, error } = await db().from("product_media").select("url, products!inner(status)").eq("id", params.mediaId).maybeSingle();
  if (error) return new Response("Could not load the image", { status: 500 });
  const row = data as { url: string; products: { status: string } | { status: string }[] } | null;
  const product = Array.isArray(row?.products) ? row?.products[0] : row?.products;
  if (!row || product?.status !== "PUBLISHED" || !isDisplayableImageUrl(row.url)) return new Response("Not found", { status: 404 });

  try {
    const jpeg = await instagramJpeg(row.url);
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.byteLength),
        // Cached at the edge so Instagram's repeat fetches (and anyone else's) don't re-run the resize.
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error(`social image ${params.mediaId}: ${err instanceof Error ? err.message : String(err)}`);
    return new Response("Could not prepare the image", { status: 502 });
  }
}
