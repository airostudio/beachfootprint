-- ============================================================
-- The Mira Journal: the four launch stories, replacing the one-line placeholders that shared their
-- titles and slugs. Content is Markdown (rendered by apps/web/lib/markdown.ts). The title and the
-- standfirst (excerpt) are rendered by the page, so the content starts after them.
-- created_at sets the reading order on /journal (newest first). Safe to re-run.
-- ============================================================

insert into blog_posts (tenant_id, slug, title, category, excerpt, status, created_at, content)
select t.id, s.slug, s.title, s.category, s.excerpt, 'PUBLISHED', s.created_at, s.content
from tenants t
cross join (values
(
  'boho-beach-capsule-wardrobe',
  'A Boho Beach Capsule Wardrobe',
  'Style',
  'The art of packing less, wearing more, and finding beauty in simplicity.',
  timestamptz '2026-10-31 09:00:00+00',
  $md$There is something wonderfully liberating about dressing for the coast. The slower mornings, the warmth of the sun, the feeling of sand beneath your feet. It's a world where fashion becomes less about following rules and more about feeling entirely yourself.

At Mira & Muse, we believe a beautiful wardrobe doesn't need to be an overflowing one. The secret lies in choosing pieces that work together effortlessly, feel wonderful against your skin, and move naturally between life's little adventures.

Enter the bohemian beach capsule wardrobe.

## What makes a wardrobe truly bohemian?

Bohemian style has always celebrated individuality, artistic expression and the freedom to dress beyond convention.

Its roots reach into creative communities, unconventional lifestyles and a love of handcrafted beauty. Today, modern boho is more refined, blending natural textures, relaxed silhouettes and thoughtful accessories.

Think breathable linen, soft cotton, beautiful embroidery, flowing dresses and earthy colours that complement the natural world.

The result? A wardrobe that's comfortable, expressive and effortlessly sophisticated.

## The 10 pieces worth packing

### 1. The effortless linen shirt

Few pieces are more versatile. Wear it open over swimwear, tucked into tailored shorts, or loosely buttoned for a late-afternoon lunch.

### 2. The flowing maxi dress

The heart of a bohemian wardrobe. Choose a silhouette that moves beautifully, whether that's a romantic floral print or a simple, sun-washed neutral.

### 3. Relaxed linen trousers

Lightweight, breathable and endlessly wearable. Pair them with a fitted tank for daytime or a delicate blouse for dinner.

### 4. The beautiful everyday tank

A simple cotton or linen-blend tank anchors the more expressive pieces in your wardrobe.

### 5. A softly structured blouse

Look for gentle gathers, subtle embroidery, balloon sleeves or a flattering neckline. Details that add personality without overwhelming an outfit.

### 6. Tailored relaxed shorts

The perfect balance between carefree and considered. Natural fabrics and uncomplicated cuts work especially well.

### 7. A lightweight layering piece

A fine-knit cardigan, airy wrap or relaxed overshirt makes cooler coastal evenings far more comfortable.

### 8. A comfortable swimsuit

Choose something that works beautifully beneath a shirt, sarong or flowing dress, allowing you to move between swimming and relaxing.

### 9. Easy leather sandals

A simple pair in tan, chocolate or black will complement almost everything.

### 10. A woven bag

Practical, beautifully textured and unmistakably bohemian. A woven tote or raffia-style shoulder bag adds warmth to even the simplest outfit.

## Build a palette inspired by nature

The easiest way to make a capsule wardrobe work is to choose colours that naturally complement one another.

Begin with three foundations:

* **Ivory or soft white** for freshness.
* **Sand, oat or warm beige** for understated elegance.
* **Chocolate or earthy brown** for depth.

Then introduce one or two accents: terracotta, sage, dusty rose or faded ocean blue.

Don't be afraid of prints. A beautifully patterned dress or blouse can become the defining piece of your entire wardrobe.

## One wardrobe, countless possibilities

Imagine a white linen shirt with relaxed shorts for your morning coffee. Later, the same shirt becomes a beach cover-up. By evening, wear it loosely over linen trousers with simple gold jewellery.

This is the beauty of thoughtful dressing.

> Fewer pieces, more possibilities.

## The Mira & Muse philosophy

A capsule wardrobe isn't about limiting your personality. It's about making room for it.

Choose pieces you genuinely love. Look for comfort, beautiful craftsmanship and versatility. Mix the old with the new. Let your jewellery tell stories, and don't worry if your favourite pieces have already travelled a thousand miles with you.

Because the most beautiful style is never forced.

It's lived in, loved and entirely your own.

*With love, Mira & Muse*

[Explore the coastal wardrobe →](/shop)$md$
),
(
  'woven-fibres-vs-synthetic-blends',
  'Woven Fibres vs. Synthetic Blends',
  'Materials & Makers',
  'Understanding what your clothes are made of — and why it matters.',
  timestamptz '2026-10-31 08:00:00+00',
  $md$Beautiful clothing begins long before the first fitting. It starts with the fibres, the weave, the texture and the way fabric responds to your body and the world around you.

For women who love coastal living and bohemian fashion, understanding fabric is one of the simplest ways to shop more thoughtfully.

At Mira & Muse, we're drawn to texture, movement and natural beauty. But choosing the right fabric isn't always as straightforward as natural versus synthetic.

Each has its strengths, and knowing the difference helps you build a wardrobe that feels as good as it looks.

## First, a little fabric knowledge

A **fibre** is the raw material used to make a textile. Cotton, linen and polyester are fibres.

A **weave** is the method used to interlace yarns into fabric. Both natural and synthetic fibres can be woven, knitted or blended.

This distinction matters because the feel, breathability and durability of a garment depend on more than its fibre label.

## The natural charm of linen

Made from the flax plant, linen is one of the most recognisable fabrics in coastal fashion.

Its distinctive texture and airy structure make it a favourite for warm-weather dressing.

**Why we love it:** Linen can absorb moisture, often allows good airflow when loosely woven, and becomes softer with repeated washing.

**Things to consider:** It wrinkles naturally and may feel crisp when new. Some linen garments can shrink if washed or dried incorrectly.

Those gentle creases are part of its charm, not necessarily something to eliminate.

## Cotton: the everyday favourite

Soft, versatile and comfortable, cotton is a foundation of relaxed fashion.

Lightweight cotton voile, breathable poplin and textured cotton gauze all offer different experiences.

**Why we love it:** Cotton is absorbent, comfortable against the skin and available in an extraordinary range of textures.

**Things to consider:** Heavier cotton can retain moisture, while some constructions may lose shape or shrink without appropriate care.

## Rayon, viscose and lyocell: beautiful drape

These fabrics deserve their own category.

Although often grouped with synthetics, rayon, viscose and lyocell are generally regenerated cellulosic fibres, commonly made from plant-derived cellulose through industrial processing.

They're particularly loved for their soft handle and flowing movement.

They can be excellent choices for romantic dresses and relaxed blouses, although their durability and washing requirements vary.

## Where synthetic fibres shine

Polyester, nylon and elastane are commonly used in contemporary clothing.

They can improve stretch, shape retention, wrinkle resistance and quick-drying performance.

For example, a small amount of elastane can make fitted garments more comfortable, while a technical polyester fabric may perform better than cotton in certain activewear situations.

The trade-off? Some synthetic fabrics feel less comfortable in hot, humid conditions, depending on the construction and finish. Many also shed persistent plastic microfibres during use and washing.

## Comparing the fabrics

| Material | Strengths | Considerations |
|---|---|---|
| Linen | Airy, absorbent, distinctive texture | Creases easily |
| Cotton | Soft, versatile, comfortable | Can retain moisture |
| Viscose/rayon | Fluid drape, smooth finish | Some varieties require delicate care |
| Lyocell | Soft, absorbent, fluid | Care depends on garment construction |
| Polyester | Quick drying, often wrinkle resistant | Comfort varies; plastic microfibre shedding |
| Nylon | Strong, lightweight, abrasion resistant | Heat sensitivity; microfibre shedding |
| Elastane blends | Stretch and flexibility | May be sensitive to heat |

## How to shop with greater confidence

Before purchasing a garment, look beyond the first impression.

Read the fibre composition label. Feel the fabric where possible. Consider whether it suits your climate and lifestyle.

Hold a lightweight piece up to the light to assess transparency. Gently stretch the seams. Inspect the stitching and finishing.

And always consider care requirements before committing.

A delicate dress that requires special handling may be perfect for occasional evenings but less practical for everyday coastal adventures.

## A more thoughtful relationship with fashion

We don't believe beautiful style should come with rigid rules.

Natural fibres aren't automatically better in every circumstance, and synthetic blends aren't inherently poor quality.

What matters is choosing appropriate fabrics, understanding their properties and buying pieces you'll genuinely want to wear.

Our ideal wardrobe is one where texture has character, quality is considered, and every garment earns its place.

> Know your fabrics. Love your clothes. Wear them beautifully.

*The Mira & Muse Journal — Materials & Makers*$md$
),
(
  'fabric-care-101',
  'Fabric Care 101',
  'Care',
  'Simple rituals to keep your favourite pieces beautiful, season after season.',
  timestamptz '2026-10-31 07:00:00+00',
  $md$Some clothes become more than something we wear.

They're the dress we remember from a summer holiday. The linen shirt that accompanies every weekend escape. The beautifully soft blouse we reach for when we want to feel effortlessly put together.

At Mira & Muse, we believe those pieces deserve a little extra love.

Good garment care doesn't need to be complicated. Often, it's the small, consistent habits that help preserve colour, shape, texture and comfort.

Here's how to care for the pieces you never want to part with.

## 1. Begin with the care label

Before washing anything, check the garment's care instructions.

Fibre composition alone doesn't determine the best washing method. Dyes, trims, lining, embellishments and construction all matter.

A cotton dress with delicate embroidery, for example, may need gentler treatment than a plain cotton T-shirt.

When in doubt, follow the label rather than assuming that every natural-fibre garment can be washed in the same way.

## 2. Wash gently, and only when needed

Frequent washing can contribute to fading, fibre wear and changes in garment shape.

If an item is clean and only needs refreshing, air it in a shaded, well-ventilated space.

When washing is necessary, a cool or lukewarm cycle is often sufficient for everyday clothing, provided the care label allows it.

Choose a mild detergent and avoid overloading the machine. Less friction means less unnecessary wear.

Delicate pieces benefit from a mesh laundry bag or careful handwashing when permitted.

## 3. After a day by the sea

Salt, sunscreen, body oils and sand can all affect your clothing.

After a coastal adventure:

* Shake away loose sand before laundering.
* Rinse saltwater-exposed garments promptly with fresh water where appropriate.
* Treat sunscreen marks according to the fabric care instructions.
* Avoid leaving damp clothing bundled inside a beach bag.
* Allow pieces to dry completely before storing.

For swimwear, rinsing in cool fresh water after use helps remove salt and chlorine. Avoid wringing delicate stretch fabrics.

## 4. Give linen a little freedom

Linen's naturally relaxed appearance is part of what makes it beautiful.

Wash according to the care label, reshape while damp and air-dry where possible.

A steamer can soften more pronounced creases without producing an overly pressed finish, provided the garment tolerates steam.

And remember: perfectly smooth linen isn't the goal.

Its charm lies in the texture.

## 5. Protect colour from harsh sunlight

While sunshine is part of coastal life, prolonged exposure to intense sunlight can fade many dyes.

Dry coloured or delicate garments in the shade when possible.

Turn suitable items inside out before washing and drying to help protect their outer surface.

For printed fabrics, avoid unnecessary heat and always check whether special care is required.

## 6. Be thoughtful with delicate fabrics

Viscose, rayon, lace, crochet and embroidered garments may require special attention.

Some viscose fabrics weaken when wet, while certain crochet or knitted pieces can stretch under their own weight.

Dry delicate knits flat when instructed, and never hang a heavy wet garment if doing so could distort its shape.

For embellished pieces, avoid friction against zippers, jewellery or rough surfaces.

## 7. Store with care

The way you store your clothing matters almost as much as how you wash it.

Use suitable hangers for structured pieces. Fold heavy knits. Keep garments clean and fully dry before storing them.

Avoid tightly packed wardrobes where clothing is continuously crushed.

For longer-term storage, choose a clean, dry location away from direct sunlight and excessive humidity.

## 8. Repair before replacing

A loose button, tiny seam opening or small snag doesn't have to mean the end of a favourite garment.

Simple repairs can extend a piece's life considerably.

Learning a few basic mending techniques — or finding a skilled local alterations specialist — is one of the most practical ways to create a wardrobe that lasts.

## A gentler approach to getting dressed

Clothing should be enjoyed, not preserved behind glass.

Wear your favourite dress to lunch. Take the linen shirt on holiday. Dance in the skirt you love.

Then give those pieces the attention they deserve.

Because caring for our clothes isn't about keeping everything pristine.

> It's about keeping the stories going.

*With care, Mira & Muse*$md$
),
(
  'packing-for-a-coastal-getaway',
  'Packing for a Coastal Getaway',
  'Travel',
  'Your guide to effortless holiday dressing, wherever the shoreline takes you.',
  timestamptz '2026-10-31 06:00:00+00',
  $md$There's a particular kind of excitement that comes with packing for somewhere beautiful.

Perhaps it's a quiet coastal village, a sun-drenched Mediterranean island or a spontaneous weekend away where the only real plan is to slow down.

Whatever the destination, packing should feel like the beginning of the escape — not the most stressful part of it.

At Mira & Muse, we believe the perfect travel wardrobe is one that leaves room for spontaneity.

Pieces that feel beautiful, travel comfortably and work just as well for a morning market as they do for dinner by the water.

## Pack for the life you'll actually live

Before reaching for your suitcase, imagine a typical day at your destination.

Morning coffee, exploring the local streets, an afternoon swim and perhaps a relaxed evening out.

What can you wear from one moment to the next?

This is the starting point for considered packing.

Choose clothing based on your activities, the forecast and how many days you'll be away, rather than packing for every possible scenario.

## The seven-day coastal edit

For a warm-weather getaway with access to laundry, begin with:

* Two flowing dresses — one casual, one versatile enough for evenings.
* Two lightweight tops in complementary colours.
* One relaxed linen shirt.
* One pair of linen trousers.
* One pair of comfortable shorts.
* Two swimsuits, allowing one to dry while the other is worn.
* One lightweight cardigan, wrap or overshirt.
* One comfortable walking sandal and one dressier footwear option.
* One woven beach tote and a small secure crossbody bag.
* A broad-brimmed hat, sunglasses and practical sun protection.
* Underwear, sleepwear and personal essentials.

Adjust the quantities to your climate, itinerary and laundry arrangements. A seven-day wardrobe doesn't necessarily require seven completely separate outfits.

## The secret is in the layers

Coastal temperatures can shift surprisingly quickly.

Warm afternoons may give way to breezy evenings, especially near open water.

A lightweight cardigan worn over a maxi dress, or an oversized shirt layered over a tank and trousers, creates warmth without sacrificing the relaxed feeling of holiday dressing.

For cooler or windier destinations, bring a practical outer layer rather than relying entirely on a shawl.

## One piece, three ways

Consider the humble linen shirt.

**Morning:** Wear it tucked loosely into shorts with flat sandals.

**Afternoon:** Throw it over swimwear for the walk back from the beach.

**Evening:** Pair it with linen trousers, simple jewellery and a woven bag.

The same principle works beautifully with slip dresses, wide-leg trousers and relaxed blouses.

Versatility doesn't need to feel repetitive when the textures and accessories do the talking.

## What to leave behind

The things you don't pack can be just as important as the things you do.

Leave behind uncomfortable shoes that haven't been worn in, garments that only work with one particular outfit, and delicate pieces unsuited to your destination.

Avoid bringing multiple heavy bags when a simple combination of tote and crossbody will do.

And resist the temptation to pack something purely because it looks lovely on holiday mood boards.

If it doesn't feel like you, it probably won't get worn.

## Make room for discovery

One of the joys of travelling is finding something unexpected.

A handmade bracelet at a local market. A beautiful woven bag. A piece of jewellery that reminds you of an afternoon you never wanted to end.

Leave a little space in your luggage for those discoveries.

They're often the pieces that become your favourites.

## Travel beautifully, travel thoughtfully

Choose breathable clothing suited to the climate, plan for changing weather and pack practical essentials alongside your favourite outfits.

Then allow yourself to enjoy the destination rather than worrying about what to wear.

The best holiday style doesn't require an oversized suitcase or an entirely new wardrobe.

Just a handful of beautiful pieces, a sense of adventure and the freedom to be yourself.

*Until the next escape, Mira & Muse*$md$
)
) as s(slug, title, category, excerpt, created_at, content)
where t.slug = 'beach-footprints-demo'
on conflict (tenant_id, slug) do update
  set title = excluded.title,
      category = excluded.category,
      excerpt = excluded.excerpt,
      content = excluded.content,
      status = 'PUBLISHED',
      created_at = excluded.created_at,
      updated_at = now();
