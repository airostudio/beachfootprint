import type { Metadata } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { CartProvider } from "@/lib/cart";
import { getNavCategories } from "@/lib/data/categories";
import { getFreeShippingNote } from "@/lib/data/settings";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Mira & Muse — A little bohemian. Entirely you.", template: "%s | Mira & Muse" },
  description: "A women's fashion boutique inspired by the coast: flowing dresses, relaxed silhouettes and beautiful textures. Find your muse. Wear your story.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Mira & Muse",
    title: "Mira & Muse — A little bohemian. Entirely you.",
    description: "A women's fashion boutique inspired by the coast. Find your muse. Wear your story.",
  },
};

// The nav is read per request so a category appears the moment its first product is published.
// That makes every page dynamic, since they all render this layout — the alternative is a header
// frozen at build time, which is the staleness this is meant to remove.
export const dynamic = "force-dynamic";

// Reads the categories that actually have published products, so the header and footer never
// advertise an empty section and pick up a new one as soon as it has stock.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [navCategories, freeShippingNote] = await Promise.all([getNavCategories(), getFreeShippingNote()]);

  return (
    <html lang="en">
      <body className="font-sans">
        <CartProvider>
          <Header categories={navCategories} />
          <main>{children}</main>
          <Footer categories={navCategories} freeShippingNote={freeShippingNote} />
        </CartProvider>
      </body>
    </html>
  );
}
