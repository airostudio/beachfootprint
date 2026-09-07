"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Catches an unhandled error anywhere under the root layout (a Supabase read failure in a page
 * that doesn't already handle it, e.g. getAllProducts/getProductsBySlugs/searchProducts) and
 * replaces just that page with on-brand copy and a retry, instead of Next's generic unbranded
 * error screen. The header/footer from the root layout stay mounted around this.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[storefront] unhandled error:", error);
  }, [error]);

  return (
    <div className="container-page py-24 text-center max-w-md mx-auto">
      <p className="eyebrow text-stone-500 mb-3">Something went wrong</p>
      <h1 className="font-serif text-3xl mb-4">We couldn&rsquo;t load this page</h1>
      <p className="text-sm text-stone-500 mb-8">
        This is on our end, not yours — try again, or head back to the shop while we sort it out.
      </p>
      <div className="flex items-center justify-center gap-4">
        <button className="btn-primary" onClick={() => reset()}>
          Try again
        </button>
        <Link href="/shop" className="text-sm underline">
          Back to Shop
        </Link>
      </div>
    </div>
  );
}
