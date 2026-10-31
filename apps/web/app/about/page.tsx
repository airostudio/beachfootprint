import type { Metadata } from "next";
import Link from "next/link";
import { renderMarkdown } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "Our Story",
  description: "A little bohemian. A little beautiful. Entirely you. A women's fashion boutique inspired by the coast and the art of being yourself.",
};

// Written without claims about founders, manufacturing, certifications or company history — add
// those here once they're established, not before.
const STORY = `Somewhere between the freedom of the coastline and the romance of a life less ordinary, you'll find Mira & Muse.

A women's fashion boutique inspired by sun-drenched days, beautiful textures, creative spirits and the effortless confidence of dressing for yourself.

We believe fashion should feel personal. Not dictated by passing trends or confined to a particular age, occasion or expectation.

Simply beautiful pieces that allow you to move through life feeling comfortable, confident and unmistakably yourself.

## Our roots are bohemian. Our spirit is timeless.

Bohemian fashion has always been about more than flowing dresses, earthy colours and delicate details.

At its heart, it's an expression of individuality.

A celebration of artistry, discovery, unconventional beauty and the freedom to choose your own path.

Those are the foundations of Mira & Muse.

We love the relaxed elegance of coastal living. The character of natural textures. The romance of a beautiful print. The way a thoughtfully chosen garment can feel both effortless and extraordinary.

Our style brings together the relaxed soul of bohemian fashion with a more contemporary, refined sensibility.

Never overly complicated. Never trying too hard.

Just pieces with personality, made to become part of your story.

## A wardrobe inspired by living

We imagine clothing that travels with you.

From slow Sunday mornings to spontaneous coastal escapes. From barefoot afternoons to evenings filled with conversation, laughter and somewhere beautiful to be.

Our collections are guided by softness, movement, colour and versatility.

Flowing dresses, relaxed silhouettes, considered details and accessories that bring an outfit to life.

We believe the best wardrobes aren't built overnight. They evolve naturally, bringing together old favourites, unexpected discoveries and pieces that simply make you feel wonderful.

We encourage buying thoughtfully, understanding fabrics and caring for the clothes you love.

Because great personal style isn't about having more.

> It's about finding what feels right.

## Inspired by women who live beautifully

Our muse isn't one particular woman.

She's the woman who follows her curiosity. Who appreciates beautiful things but never lets them define her. Who might feel at home by the ocean, in a bustling city or somewhere entirely new.

She's independent, expressive, creative and comfortable doing things her own way.

Some days she's dressed in beautiful linen and simple sandals.

Other days she's wearing a romantic print, statement jewellery and a little more confidence than yesterday.

She doesn't dress for the expectations of others.

She dresses for the life she's creating.

And that's what makes her our muse.

## More than a boutique

Mira & Muse is also a place for ideas, inspiration and discovery.

Through **[The Mira Journal](/journal)**, we explore the details that make fashion and everyday living more interesting.

From understanding fabrics and caring for favourite garments to building a thoughtful wardrobe and discovering the art of effortless travel.

We appreciate independent fashion storytelling and creative publications such as *Alice.D Magazine*, whose exploration of fashion, art and culture reflects the kind of individuality and creative curiosity we admire.

Our journal brings that spirit of thoughtful discovery into our own world — with practical advice, considered perspectives and an appreciation for the beautiful details.

Because personal style is shaped by more than the clothes we wear.

It's influenced by the places we visit, the people we meet, the cultures we discover and the experiences we carry with us.

## The beauty of being yourself

We don't believe women need to fit into a particular style to feel beautiful.

Whether you're drawn to soft neutrals, rich earthy tones, romantic florals or something wonderfully unexpected, there's room to make bohemian fashion your own.

Wear the dress.

Mix the textures.

Choose the unexpected accessory.

Travel somewhere new.

And never underestimate the beauty of feeling comfortable in your own skin.

**Mira & Muse is for the free-spirited, the quietly confident, the curious and the beautifully individual.**

Rooted in bohemian freedom.

Inspired by the coast.

Designed around the art of being you.`;

export default function AboutPage() {
  return (
    <div className="container-page py-16 sm:py-20">
      <header className="max-w-2xl mx-auto text-center mb-14">
        <p className="eyebrow mb-5">Our Story</p>
        <h1 className="font-serif text-5xl sm:text-6xl mb-6">Mira &amp; Muse</h1>
        <p className="font-serif italic text-xl sm:text-2xl text-stone-600">A little bohemian. A little beautiful. Entirely you.</p>
        <div className="mx-auto mt-10 h-px w-16 bg-accent" aria-hidden />
      </header>

      <div className="max-w-2xl mx-auto text-[17px] leading-[1.8] text-stone-700">{renderMarkdown(STORY)}</div>

      <div className="max-w-2xl mx-auto mt-16 pt-10 border-t border-stone-200 text-center">
        <p className="font-serif text-3xl mb-3">Welcome to Mira &amp; Muse.</p>
        <p className="font-serif italic text-xl text-stone-600 mb-10">Find your muse. Wear your story.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="btn-primary">
            Shop the collection
          </Link>
          <Link href="/journal" className="btn-secondary">
            Read the Journal
          </Link>
        </div>
      </div>
    </div>
  );
}
