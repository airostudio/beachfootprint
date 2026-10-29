"use client";

import { useFormState, useFormStatus } from "react-dom";
import { lookupOrderAction, type LookupState } from "../actions";
import { formatMoney } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid — being prepared",
  FULFILLING: "Ordered from our supplier",
  FULFILLED: "Shipped",
  DELIVERED: "Delivered",
  CANCELED: "Cancelled",
  REFUNDED: "Refunded",
  RETURN_REQUESTED: "Return requested",
  RETURNED: "Returned",
};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Looking up…" : "Find my order"}
    </button>
  );
}

export default function OrderLookup() {
  const [state, action] = useFormState<LookupState, FormData>(lookupOrderAction, { order: null, error: null, searched: false });
  const order = state.order;

  return (
    <div className="max-w-lg">
      <p className="text-sm text-stone-500 mb-6">
        Enter the email you ordered with and the order reference from your confirmation (8 characters, e.g. 4D426D11).
      </p>
      <form action={action} className="space-y-4 text-sm mb-8">
        <div>
          <label htmlFor="lookup-email" className="block mb-1">
            Email
          </label>
          <input id="lookup-email" name="email" type="email" required autoComplete="email" className="w-full border border-stone-300 px-3 py-2" />
        </div>
        <div>
          <label htmlFor="lookup-ref" className="block mb-1">
            Order reference
          </label>
          <input id="lookup-ref" name="reference" required className="w-full border border-stone-300 px-3 py-2 font-mono uppercase" />
        </div>
        <Submit />
        {state.error && <p className="text-red-600">{state.error}</p>}
      </form>

      {order && (
        <div className="border border-stone-200 p-5 text-sm">
          <div className="flex justify-between items-baseline mb-3">
            <p className="font-mono font-medium">{order.reference}</p>
            <p className="text-stone-500">{new Date(order.placedAt).toLocaleDateString()}</p>
          </div>
          <p className="mb-4">
            <span className="text-stone-500">Status:</span> <span className="font-medium">{STATUS_LABEL[order.status] ?? order.status}</span>
          </p>
          {order.trackingNumber && (
            <p className="mb-4">
              <span className="text-stone-500">Tracking:</span> {order.carrier ? `${order.carrier} ` : ""}
              <span className="font-mono">{order.trackingNumber}</span>
            </p>
          )}
          <ul className="divide-y divide-stone-100 border-t border-stone-200">
            {order.items.map((item, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>
                  {item.quantity} × {item.title}
                </span>
                <span>{formatMoney(item.lineTotalCents, order.currency)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between font-medium border-t border-stone-200 pt-2 mt-2">
            <span>Total</span>
            <span>{formatMoney(order.totalCents, order.currency)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
