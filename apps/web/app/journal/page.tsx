import type { Metadata } from "next";
import Link from "next/link";
import { getGuides } from "@/lib/data/guides";

export const metadata: Metadata = {
  title: "The Mira Journal",
  description: "Stories of style, texture, travel and the art of living beautifully, from Mira & Muse.",
};
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const [featured, ...rest] = await getGuides();

  return (
    <div className="container-page py-16 sm:py-20">
      <header className="max-w-2xl mb-14">
        <p className="eyebrow mb-4">Mira &amp; Muse / Editorial</p>
        <h1 className="font-serif text-5xl sm:text-6xl mb-5">The Mira Journal</h1>
        <p className="text-lg text-stone-600 leading-relaxed">Stories of style, texture, travel and the art of living beautifully.</p>
      </header>

      {!featured ? (
        <p className="text-sm text-stone-500 border border-stone-200 p-8">New stories are on their way.</p>
      ) : (
        <>
          <Link href={`/journal/${featured.slug}`} className="group block bg-warm-100 p-8 sm:p-14 mb-12">
            <p className="eyebrow mb-4">
              {featured.category} · {featured.minutes} min read
            </p>
            <h2 className="font-serif text-4xl sm:text-5xl leading-tight mb-5 max-w-3xl group-hover:text-ink-700 transition-colors">{featured.title}</h2>
            <p className="font-serif italic text-xl text-stone-600 max-w-2xl mb-8">{featured.excerpt}</p>
            <span className="text-xs tracking-widest2 uppercase text-ink-950 border-b border-accent pb-1">Read the story</span>
          </Link>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
            {rest.map((g) => (
              <Link key={g.slug} href={`/journal/${g.slug}`} className="group block border-t border-ink-950 pt-6">
                <p className="eyebrow mb-3">
                  {g.category} · {g.minutes} min read
                </p>
                <h2 className="font-serif text-2xl leading-snug mb-3 group-hover:text-ink-700 transition-colors">{g.title}</h2>
                <p className="text-sm text-stone-600 leading-relaxed mb-5">{g.excerpt}</p>
                <span className="text-xs tracking-widest2 uppercase text-ink-950 border-b border-accent pb-1">Read the story</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
