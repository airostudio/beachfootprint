"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const primaryNav = [
  { label: "Shop", href: "/shop" },
  { label: "Silicone Dolls", href: "/shop/silicone-dolls" },
  { label: "Adult Products", href: "/shop/adult-products" },
  { label: "Accessories", href: "/shop/accessories" },
  { label: "Care", href: "/shop/care" },
  { label: "New", href: "/shop/new-arrivals" },
  { label: "Sale", href: "/shop/sale" },
  { label: "Guides", href: "/guides" },
];

const iconLinks = [
  { label: "Search", href: "/shop?focus=search" },
  { label: "Wishlist", href: "/account/wishlist" },
  { label: "Account", href: "/account" },
  { label: "Cart", href: "/cart" },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

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

        <Link href="/" className="relative z-10 h-16 shrink-0 flex items-start" aria-label="Valley Of The Dolls home">
          <Image
            src="/valley-logo.png"
            alt="The Valley of the Dolls"
            width={2816}
            height={1536}
            priority
            className="h-[100px] w-auto object-contain"
          />
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
