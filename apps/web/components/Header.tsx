"use client";

import Link from "next/link";
import { useState } from "react";

export interface NavCategory {
  handle: string;
  name: string;
}

const iconLinks = [
  { label: "Search", href: "/search" },
  { label: "Wishlist", href: "/account/wishlist" },
  { label: "Account", href: "/account" },
  { label: "Cart", href: "/cart" },
];

/**
 * Category links come from the layout, which reads the categories that actually have published
 * products — so an empty category never appears in the menu, and a new one appears as soon as its
 * first product is published, without this list being edited.
 */
export default function Header({ categories }: { categories: NavCategory[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const primaryNav = [
    { label: "Shop", href: "/shop" },
    ...categories.map((c) => ({ label: c.name, href: `/shop/${c.handle}` })),
    { label: "Guides", href: "/guides" },
  ];

  return (
    <header className="sticky top-0 z-40 bg-warm-50/95 backdrop-blur border-b border-stone-200">
      <div className="container-page flex h-16 items-center justify-between">
        <button
          className="lg:hidden text-sm tracking-widest2 uppercase"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label="Toggle menu"
        >
          Menu
        </button>

        <Link href="/" className="relative z-10 shrink-0 flex items-center" aria-label="Beach Footprints home">
          <span className="font-serif text-2xl tracking-wide text-ink-950">Beach Footprints</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-7">
          {primaryNav.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm tracking-wide text-ink-800 hover:text-ink-950 transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          {iconLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hidden sm:inline text-xs tracking-widest2 uppercase text-ink-700 hover:text-ink-950 transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Link href="/cart" className="sm:hidden text-xs uppercase tracking-widest2">
            Cart
          </Link>
        </div>
      </div>

      {mobileOpen && (
        <nav className="lg:hidden border-t border-stone-200 bg-warm-50">
          <div className="container-page py-4 flex flex-col gap-4">
            {[...primaryNav, ...iconLinks].map((item) => (
              <Link key={item.href} href={item.href} className="text-sm" onClick={() => setMobileOpen(false)}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
