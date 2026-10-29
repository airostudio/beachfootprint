import Link from "next/link";

export default function AccountOverviewPage() {
  return (
    <div className="space-y-6 text-sm">
      <p className="text-stone-500">
        Customer sign-in isn&rsquo;t available yet, so there&rsquo;s nothing to log in to — everything you need works with the email you
        ordered with.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/account/orders" className="card p-6 block hover:border-ink-950">
          <p className="eyebrow mb-2">Track an order</p>
          <p className="text-stone-500">See status and tracking using your email and order reference.</p>
        </Link>
        <Link href="/account/support" className="card p-6 block hover:border-ink-950">
          <p className="eyebrow mb-2">Get help</p>
          <p className="text-stone-500">Questions about an order, a return or a product — send us a message.</p>
        </Link>
      </div>
    </div>
  );
}
