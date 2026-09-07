"use client";

import { useEffect } from "react";

/**
 * Catches an unhandled error anywhere under the admin layout (a Supabase read failure that a
 * screen doesn't already handle) so an admin sees an on-brand message and a retry inside the
 * admin chrome, rather than Next's generic unbranded error screen.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[admin] unhandled error:", error);
  }, [error]);

  return (
    <div className="border border-red-200 bg-red-50 px-6 py-8 text-center max-w-lg">
      <p className="text-sm font-medium text-red-800 mb-2">This screen couldn&rsquo;t load</p>
      <p className="text-xs text-stone-600 mb-4">
        {error.message || "An unexpected error occurred."} — this is usually transient (a database hiccup); try again.
      </p>
      <button className="btn-secondary text-xs px-3 py-1.5" onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
