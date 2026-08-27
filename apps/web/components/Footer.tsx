import Link from "next/link";

const columns = [
  {
    title: "Shop",
    links: [
      { label: "Silicone Dolls", href: "/shop/silicone-dolls" },
      { label: "Adult Products", href: "/shop/adult-products" },
      { label: "Accessories", href: "/shop/accessories" },
      { label: "Care & Maintenance", href: "/shop/care" },
      { label: "Build Your Doll", href: "/build-your-doll" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Contact & Support", href: "/account/support" },
      { label: "Returns", href: "/guides/product-care-101" },
      { label: "Warranty", href: "/guides/product-care-101" },
      { label: "Care Assistant", href: "/care" },
      { label: "Compare Products", href: "/compare" },
    ],
  },
  {
    title: "Trust",
    links: [
      { label: "Discreet Delivery", href: "/guides/discreet-shipping-explained" },
      { label: "Privacy Policy", href: "/account/privacy" },
      { label: "Shipping Information", href: "/guides/discreet-shipping-explained" },
      { label: "Product Finder", href: "/product-finder" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-stone-200 bg-ink-950 text-warm-100 mt-24">
      <div className="container-page py-16 grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-serif text-2xl mb-4">Valley Of The Dolls</p>
          <p className="text-sm text-stone-400 leading-relaxed max-w-xs">
            Discreet delivery, body-safe materials and considered design — every order is packed to protect your privacy.
          </p>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <p className="eyebrow text-stone-500 mb-4">{col.title}</p>
            <ul className="space-y-3">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-stone-300 hover:text-warm-50 transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-800">
        <div className="container-page py-6 text-xs text-stone-500 flex flex-col sm:flex-row justify-between gap-2">
          <p>© {new Date().getFullYear()} Valley Of The Dolls. All rights reserved.</p>
          <p>Discreet packaging on every order. 18+ only.</p>
        </div>
      </div>
    </footer>
  );
}
