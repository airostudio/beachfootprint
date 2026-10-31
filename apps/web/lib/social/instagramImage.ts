import "server-only";
import sharp from "sharp";
import { isBlockedFetchTarget } from "../import/urlSafety";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 15 * 1024 * 1024;

// Instagram only accepts JPEGs between 4:5 (portrait) and 1.91:1 (landscape), and a carousel is
// cropped to its first photo's shape. Supplier photos come in every shape and format — many are
// 3:4 WebP files named .jpg, which Instagram rejects outright — so every photo is converted to JPEG
// and fitted onto one 4:5 canvas in the storefront's background colour. Nothing gets cropped off,
// and every post looks consistent. Used for Facebook too, whose photo upload doesn't take WebP.
export const INSTAGRAM_WIDTH = 1080;
export const INSTAGRAM_HEIGHT = 1350;
const BACKGROUND = "#faf9f6";

/** Downloads a product photo (checking every redirect hop against internal addresses) with a size cap. */
async function fetchImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let target = new URL(url);
    for (let hop = 0; hop < 5; hop++) {
      if (await isBlockedFetchTarget(target)) throw new Error("image host is not allowed");
      const response = await fetch(target, { redirect: "manual", signal: controller.signal, cache: "no-store" });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        target = new URL(location, target);
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`image host answered ${response.status}`);
      if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) throw new Error("image is too large");

      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          throw new Error("image is too large");
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    }
    throw new Error("too many redirects");
  } finally {
    clearTimeout(timeout);
  }
}

/** A product photo as an Instagram-ready 1080×1350 JPEG. */
export async function instagramJpeg(sourceUrl: string): Promise<Buffer> {
  const source = await fetchImage(sourceUrl);
  return sharp(source, { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(INSTAGRAM_WIDTH, INSTAGRAM_HEIGHT, { fit: "contain", background: BACKGROUND })
    .flatten({ background: BACKGROUND })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}
