"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SLIDE_FILES = [
  "EIB500-banner-2.webp",
  "IR-IRONAI-BANNER.webp",
  "Japanese-Illustrator-sex-doll-161M-A6-ROS-MAX-Kurumi-Silk-Glow.webp",
  "Lounge-Owner-Sex-Doll-164LN-S19-Pearl-Natural.webp",
  "Socialite-Beauty-Sex-Doll-158T-S40-Eileen-Silk-Glow.webp",
  "Young-Series-Sunshine-Traveler-Sex-Doll-166cm-2.0-N01-Mio-Natural.webp",
  "Young-SeriesBlue-Fairy-Sex-Doll-154cm-N02-Zia-Natural.webp",
];

const HOLD_MS = 6000;
const FADE_MS = 2000;

function altFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Crossfading hero slideshow. Order is randomized per page load (client-side
 * only, so the server-rendered first paint stays deterministic and hydration
 * doesn't warn) — the slide list itself is fixed, just its order isn't.
 */
export default function HeroSlideshow() {
  const [order, setOrder] = useState(SLIDE_FILES);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setOrder(shuffle(SLIDE_FILES));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveIndex((i) => (i + 1) % order.length);
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [order.length]);

  return (
    <div className="absolute inset-0">
      {order.map((filename, i) => (
        <Image
          key={filename}
          src={`/hero/${filename}`}
          alt={altFromFilename(filename)}
          fill
          priority={i === 0}
          sizes="100vw"
          className="object-cover transition-opacity ease-in-out"
          style={{ transitionDuration: `${FADE_MS}ms`, opacity: i === activeIndex ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
