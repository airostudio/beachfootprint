"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PaymentsStatus {
  stripe: {
    secretKeyConfigured: boolean;
    publishableKeyConfigured: boolean;
    webhookSecretConfigured: boolean;
    mode: "live" | "test" | null;
    modeMismatch: boolean;
  };
  sellingCurrency: string | null;
  storeCurrency: string | null;
  checkoutImplemented: boolean;
}

function StatusRow({ label, ok, envVar, detail }: { label: string; ok: boolean; envVar: string; detail: string }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-stone-100 last:border-0">
      <span className={`text-sm mt-0.5 ${ok ? "text-green-700" : "text-red-600"}`}>{ok ? "✓" : "✕"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          {label} <span className={ok ? "text-green-700" : "text-red-600"}>{ok ? "configured" : "not set"}</span>
        </p>
        <p className="text-xs text-stone-500 mt-0.5">
          <code className="bg-stone-100 px-1">{envVar}</code> — {detail}
        </p>
      </div>
    </div>
  );
}

export default function PaymentsSettingsPage() {
  const [status, setStatus] = useState<PaymentsStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/payments")
      .then((res) => res.json())
      .then((data) => (data.error ? Promise.reject(new Error(data.error)) : setStatus(data)))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load payment settings"));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!status) return <p className="text-sm text-stone-500">Checking payment configuration…</p>;

  const allSet =
    status.stripe.secretKeyConfigured && status.stripe.publishableKeyConfigured && status.stripe.webhookSecretConfigured;

  return (
    <div className="max-w-2xl">
      <p className="eyebrow mb-2">Payments</p>
      <h1 className="font-serif text-3xl mb-2">Stripe</h1>
      <p className="text-sm text-stone-600 mb-8">
        Stripe credentials are read from this deployment&rsquo;s environment variables, not stored in the database — a
        secret key in a table is one careless query away from leaking, and rotating it should be a deploy setting. This
        screen reports what is configured; set the values in Vercel → Settings → Environment Variables.
      </p>

      {!status.checkoutImplemented && (
        <div className="border border-amber-600 bg-amber-50 px-4 py-3 mb-6 text-sm">
          <p className="font-medium mb-1">Checkout does not take payments yet</p>
          <p className="text-xs text-stone-700">
            The checkout page is currently a front-end flow only — it collects details and shows a review step, but no
            payment intent is created and no card is ever charged. Setting the keys below is necessary for taking money,
            but not sufficient on its own: the checkout still needs to be wired to Stripe before the store can go live.
          </p>
        </div>
      )}

      <section className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-serif text-xl">Credentials</h2>
          {status.stripe.mode && (
            <span
              className={`text-xs px-2 py-1 ${status.stripe.mode === "live" ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-600"}`}
            >
              {status.stripe.mode === "live" ? "Live mode" : "Test mode"}
            </span>
          )}
        </div>

        <StatusRow
          label="Secret key"
          ok={status.stripe.secretKeyConfigured}
          envVar="STRIPE_SECRET_KEY"
          detail="server-side key used to create charges. Never expose this to the browser."
        />
        <StatusRow
          label="Publishable key"
          ok={status.stripe.publishableKeyConfigured}
          envVar="NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
          detail="safe to send to the browser; used by Stripe's card fields."
        />
        <StatusRow
          label="Webhook signing secret"
          ok={status.stripe.webhookSecretConfigured}
          envVar="STRIPE_WEBHOOK_SECRET"
          detail="verifies Stripe's callbacks so an order is only marked paid on a genuine event."
        />

        {status.stripe.modeMismatch && (
          <p className="text-sm text-red-600 mt-4">
            Your secret and publishable keys are from different modes (one live, one test). Checkout will fail — use a
            matching pair.
          </p>
        )}

        {allSet && status.stripe.mode === "test" && (
          <p className="text-xs text-stone-500 mt-4">
            Test keys are in use, so no real money moves. Swap in live keys when you&rsquo;re ready to take orders.
          </p>
        )}
      </section>

      <section className="card p-6">
        <h2 className="font-serif text-xl mb-4">Currency</h2>
        <div className="text-sm space-y-2">
          <p>
            Selling currency:{" "}
            <span className="font-medium">{status.sellingCurrency ?? "not set"}</span>{" "}
            <Link href="/admin/aliexpress/settings" className="text-xs underline">
              change
            </Link>
          </p>
          {status.storeCurrency && (
            <p className="text-stone-600">
              Existing product prices are stored in <span className="font-medium">{status.storeCurrency}</span>.
            </p>
          )}
        </div>
        <p className="text-xs text-stone-500 mt-3">
          Charge customers in the same currency your products are priced in. Changing the selling currency affects
          products imported from then on — it does not re-price products already in the catalogue.
        </p>
        {status.sellingCurrency && status.storeCurrency && status.sellingCurrency !== status.storeCurrency && (
          <p className="text-sm text-amber-700 mt-3">
            Your import currency ({status.sellingCurrency}) differs from the currency existing products are priced in (
            {status.storeCurrency}). New imports will be priced in {status.sellingCurrency}, leaving the catalogue mixed.
          </p>
        )}
      </section>
    </div>
  );
}
