import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AgeGate from "@/components/AgeGate";

export const metadata: Metadata = {
  metadataBase: new URL("https://example.com"),
  title: { default: "Valley Of The Dolls — Private. Premium. Personal.", template: "%s | Valley Of The Dolls" },
  description: "Premium adult products, silicone dolls and accessories through a discreet shopping experience built around privacy, quality and choice.",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Valley Of The Dolls",
    title: "Valley Of The Dolls — Private. Premium. Personal.",
    description: "Discreet, premium shopping for adult products, silicone dolls and accessories.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AgeGate />
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
