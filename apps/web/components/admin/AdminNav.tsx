"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/cms", label: "CMS & Banners" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/aliexpress", label: "AliExpress" },
  { href: "/admin/aliexpress/staging", label: "AliExpress Staging" },
  { href: "/admin/aliexpress/settings", label: "Dropship Settings" },
];

/** The most specific section matching the current path, so /admin/aliexpress/staging doesn't also light up "AliExpress". */
function activeHref(pathname: string): string | undefined {
  return sections
    .map((s) => s.href)
    .filter((href) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0];
}

/**
 * Wraps onto further lines on narrow screens instead of scrolling sideways — every section stays
 * visible without having to swipe the menu to find it. The current section is highlighted.
 */
export default function AdminNav() {
  const active = activeHref(usePathname() ?? "");
  return (
    <nav className="flex flex-wrap gap-x-1 gap-y-1">
      {sections.map((s) => {
        const isActive = s.href === active;
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={isActive ? "page" : undefined}
            className={`px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
              isActive ? "bg-warm-50 text-ink-950" : "text-stone-300 hover:text-warm-50 hover:bg-ink-800"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
