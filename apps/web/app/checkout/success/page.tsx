import Link from "next/link";
import ClearCart from "./ClearCart";
import { isStripeConfigured, stripe } from "@/lib/checkout/stripe";
import { orderReference } from "@/lib/orderReference";

export const dynamic = "force-dynamic";

/**
 * Stripe's return page. It used to announce "your payment went through" to anyone who reached
 * it, without looking at the session — including async payment methods that hadn't cleared yet.
 * The session is now read from Stripe server-side, so the page says what actually happened and
 * gives the customer the reference they'll need to look the order up or contact support.
 *
 * Reaching this page still never marks anything paid; the webhook does that.
 */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: { session_id?: string } }) {
  const sessionId = searchParams.session_id;
  let state: "paid" | "processing" | "unknown" = "unknown";
  let reference: string | null = null;
  let email: string | null = null;

  if (sessionId?.startsWith("cs_") && isStripeConfigured()) {
    try {
      const session = await stripe().checkout.sessions.retrieve(sessionId);
      const orderId = session.metadata?.orderId;
      if (orderId) reference = orderReference(orderId);
      email = session.customer_details?.email ?? null;
      if (session.status === "complete") state = session.payment_status === "paid" ? "paid" : "processing";
    } catch (error) {
      console.error(`[checkout/success] could not read session ${sessionId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  return (
    <div className="container-page py-20 text-center max-w-lg">
      {state !== "unknown" && <ClearCart />}
      {state === "paid" ? (
        <>
          <h1 className="font-serif text-4xl mb-4">Thank you ✓</h1>
          <p className="text-stone-600 mb-2">Your payment went through and your order is confirmed.</p>
        </>
      ) : state === "processing" ? (
        <>
          <h1 className="font-serif text-4xl mb-4">Order received</h1>
          <p className="text-stone-600 mb-2">
            Your payment is still being processed by your bank. We&rsquo;ll email you as soon as it clears — nothing more to do for now.
          </p>
        </>
      ) : (
        <>
          <h1 className="font-serif text-4xl mb-4">Checking your order…</h1>
          <p className="text-stone-600 mb-2">
            We couldn&rsquo;t confirm this payment from here. If you completed checkout, you&rsquo;ll receive an email confirmation shortly.
          </p>
        </>
      )}
      {reference && (
        <p className="text-sm text-stone-700 my-6">
          Your order reference is <span className="font-mono font-medium text-ink-950">{reference}</span>
          {email && (
            <>
              {" "}
              — confirmation sent to <span className="font-medium">{email}</span>
            </>
          )}
          .
        </p>
      )}
      <div className="flex gap-3 justify-center mt-8">
        <Link href="/shop" className="btn-primary">
          Continue Shopping
        </Link>
        <Link href="/account/orders" className="btn-secondary">
          Track Your Order
        </Link>
      </div>
    </div>
  );
}
