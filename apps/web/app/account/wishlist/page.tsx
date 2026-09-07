// Wishlists are per-customer (see wishlists/wishlist_items in supabase/schema.sql)
// and need a signed-in customer to scope the query — Supabase Auth isn't wired
// up yet (see README "What's stubbed"), so this is an honest empty state
// rather than showing someone else's — or fabricated — saved products.
//
// The PIN-protect control that used to live here was removed rather than kept as a stub: it
// looked like a working security feature (a checkbox revealing a password field) but saved
// nothing anywhere, which is a worse kind of dishonest stub than simply not having the feature —
// see the audit note that flagged it.
export default function WishlistPage() {
  return (
    <div>
      <p className="text-sm text-stone-500 mb-6">My Wishlist</p>
      <p className="text-sm text-stone-500 border border-stone-200 p-6">
        Sign in to see items you've saved. Account sign-in isn't connected yet — see the README for what's still stubbed.
      </p>
    </div>
  );
}
