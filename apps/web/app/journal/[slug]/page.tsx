import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuideBySlug, getGuides } from "@/lib/data/guides";
import { safeJsonLd } from "@/lib/jsonLd";
import { renderMarkdown } from "@/lib/markdown";
import { SITE_URL } from "@/lib/siteUrl";

export const dynamic = "force-dynamic";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = await getGuideBySlug(params.slug);
  if (!story) return {};
  return {
    title: story.title,
    description: story.excerpt,
    alternates: { canonical: `/journal/${story.slug}` },
    openGraph: { type: "article", title: story.title, description: story.excerpt, publishedTime: story.publishedAt },
  };
}

export default async function JournalStoryPage({ params }: Props) {
  const story = await getGuideBySlug(params.slug);
  if (!story) notFound();
  const more = (await getGuides()).filter((g) => g.slug !== story.slug).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: story.title,
    description: story.excerpt,
    articleSection: story.category,
    datePublished: story.publishedAt,
    dateModified: story.updatedAt,
    mainEntityOfPage: `${SITE_URL}/journal/${story.slug}`,
    author: { "@type": "Organization", name: "Mira & Muse" },
    publisher: { "@type": "Organization", name: "Mira & Muse" },
  };

  return (
    <article className="container-page py-16 sm:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <header className="max-w-2xl mx-auto text-center mb-14">
        <p className="eyebrow mb-5">
          <Link href="/journal" className="hover:text-ink-950">
            The Mira Journal
          </Link>{" "}
          · {story.category}
        </p>
        <h1 className="font-serif text-4xl sm:text-6xl leading-tight mb-6">{story.title}</h1>
        <p className="font-serif italic text-xl sm:text-2xl text-stone-600 leading-snug">{story.excerpt}</p>
        <p className="text-xs tracking-widest2 uppercase text-stone-400 mt-8">{story.minutes} min read</p>
        <div className="mx-auto mt-10 h-px w-16 bg-accent" aria-hidden />
      </header>

      <div className="max-w-2xl mx-auto text-[17px] leading-[1.8] text-stone-700">{renderMarkdown(story.content)}</div>

      <p className="max-w-2xl mx-auto mt-16 pt-8 border-t border-stone-200 text-center font-serif italic text-xl text-ink-900">
        Find your muse. Wear your story.
      </p>

      {more.length > 0 && (
        <aside className="mt-24">
          <div className="flex items-end justify-between mb-8">
            <h2 className="font-serif text-3xl">More from the Journal</h2>
            <Link href="/journal" className="btn-ghost">
              All stories
            </Link>
          </div>
          <div className="grid sm:grid-cols-3 gap-x-10 gap-y-10">
            {more.map((g) => (
              <Link key={g.slug} href={`/journal/${g.slug}`} className="group block border-t border-ink-950 pt-5">
                <p className="eyebrow mb-3">{g.category}</p>
                <h3 className="font-serif text-xl leading-snug mb-2 group-hover:text-ink-700 transition-colors">{g.title}</h3>
                <p className="text-sm text-stone-600">{g.excerpt}</p>
              </Link>
            ))}
          </div>
        </aside>
      )}
    </article>
  );
}
