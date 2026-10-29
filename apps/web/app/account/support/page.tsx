"use client";

import { useFormState, useFormStatus } from "react-dom";
import { submitSupportAction, type SupportState } from "../actions";

const categories = [
  { value: "ORDER", label: "Order" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "RETURN", label: "Return" },
  { value: "PRODUCT", label: "Product" },
  { value: "WARRANTY", label: "Warranty" },
  { value: "OTHER", label: "Other" },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? "Sending…" : "Send Message"}
    </button>
  );
}

export default function SupportPage() {
  const [state, action] = useFormState<SupportState, FormData>(submitSupportAction, { ok: false, error: null });

  return (
    <div className="max-w-lg">
      <p className="text-sm text-stone-500 mb-6">
        Include your order reference if it&rsquo;s about an order — we only ask for what&rsquo;s needed to help.
      </p>
      {state.ok ? (
        <p className="text-sm">Thanks — we&rsquo;ve received your message and will reply to your email.</p>
      ) : (
        <form action={action} className="space-y-4 text-sm">
          <div>
            <label htmlFor="support-email" className="block mb-1">
              Your email
            </label>
            <input id="support-email" name="email" type="email" required autoComplete="email" className="w-full border border-stone-300 px-3 py-2" />
          </div>
          <div>
            <label htmlFor="support-name" className="block mb-1">
              Name (optional)
            </label>
            <input id="support-name" name="name" autoComplete="name" className="w-full border border-stone-300 px-3 py-2" />
          </div>
          <div>
            <label htmlFor="support-ref" className="block mb-1">
              Order reference (optional)
            </label>
            <input id="support-ref" name="reference" className="w-full border border-stone-300 px-3 py-2 font-mono uppercase" placeholder="4D426D11" />
          </div>
          <div>
            <label htmlFor="support-category" className="block mb-1">
              Category
            </label>
            <select id="support-category" name="category" className="w-full border border-stone-300 px-3 py-2">
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="support-message" className="block mb-1">
              Message
            </label>
            <textarea id="support-message" name="message" required minLength={10} rows={5} className="w-full border border-stone-300 px-3 py-2" />
          </div>
          <Submit />
          {state.error && <p className="text-red-600">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
