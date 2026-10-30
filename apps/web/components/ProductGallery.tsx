"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useProductImage } from "@/components/ProductImageContext";

export default function ProductGallery({ images }: { images: { url: string; alt: string }[] }) {
  const [active, setActive] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const picked = useProductImage();
  const selectedImage = picked?.selectedImage ?? null;

  // The overlay had no keyboard escape route at all — a keyboard-only or screen-reader user who
  // opened it could not get back out.
  useEffect(() => {
    if (!fullscreen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen]);

  // When a colour is picked, its photo takes the main slot. If that photo is also one of the
  // gallery images, select that thumbnail too, so the strip and the main image agree.
  useEffect(() => {
    if (!selectedImage) return;
    const index = images.findIndex((img) => img.url === selectedImage);
    if (index >= 0) setActive(index);
  }, [selectedImage, images]);

  const main = selectedImage ? (images.find((img) => img.url === selectedImage) ?? { url: selectedImage, alt: images[0]?.alt ?? "Selected colour" }) : images[active];

  // Indexing images[active] on an empty list throws and takes the product page down with it. A
  // product with no usable imagery is a normal state — nothing uploaded yet, or the only files on
  // record are http and can't be displayed — so it gets an empty frame instead.
  if (!main) {
    return (
      <div className="relative w-full aspect-[4/5] bg-stone-200 flex items-center justify-center">
        <span className="text-xs tracking-widest2 uppercase text-stone-500">No image available</span>
      </div>
    );
  }

  const showingThumb = (i: number) => (selectedImage ? images[i].url === selectedImage : i === active);

  return (
    <div>
      <button className="relative w-full aspect-[4/5] bg-stone-200 overflow-hidden block" onClick={() => setFullscreen(true)} aria-label="Open fullscreen gallery">
        <Image key={main.url} src={main.url} alt={main.alt} fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" priority />
      </button>
      {images.length > 1 && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {images.map((img, i) => (
            <button
              key={img.url}
              onClick={() => {
                setActive(i);
                // A thumbnail click takes over from the colour's photo.
                picked?.setSelectedImage(null);
              }}
              aria-label={`Show image ${i + 1}`}
              className={`relative aspect-square bg-stone-200 overflow-hidden border ${showingThumb(i) ? "border-ink-950" : "border-transparent"}`}
            >
              <Image src={img.url} alt={img.alt} fill sizes="150px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {fullscreen && (
        <div
          className="fixed inset-0 z-[90] bg-ink-950/95 flex items-center justify-center p-6"
          onClick={() => setFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Fullscreen image: ${main.alt}`}
        >
          <div className="relative w-full max-w-3xl aspect-[4/5]">
            <Image src={main.url} alt={main.alt} fill sizes="100vw" className="object-contain" />
          </div>
          <button
            className="absolute top-6 right-6 text-warm-50 text-sm tracking-widest2 uppercase"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(false);
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
