"use client";

import { useEffect, useState } from "react";

/** Public contact details: shown on the policy pages, and where support-form messages are emailed. */
export default function StoreContactCard() {
  const [values, setValues] = useState({ contactEmail: "", contactPhone: "", contactAddress: "" });
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/store-contact")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setValues({ contactEmail: data.contactEmail ?? "", contactPhone: data.contactPhone ?? "", contactAddress: data.contactAddress ?? "" });
        setLoaded(true);
      })
      .catch((err) => setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not load contact details" }));
  }, []);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/store-contact", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      setMessage({ ok: true, text: "Saved." });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof typeof values, label: string, type = "text") => (
    <label className="block text-sm">
      <span className="block text-xs text-stone-500 mb-1">{label}</span>
      <input
        type={type}
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        className="w-full border border-stone-300 px-3 py-2 text-sm"
      />
    </label>
  );

  return (
    <section className="card p-6 mt-6">
      <h2 className="font-serif text-xl mb-2">Store contact details</h2>
      <p className="text-xs text-stone-500 mb-4">
        Shown on the policy pages. New support messages are emailed to the contact email (once customer emails are configured above).
      </p>
      {loaded ? (
        <div className="space-y-3">
          {field("contactEmail", "Contact email", "email")}
          {field("contactPhone", "Phone (optional)", "tel")}
          {field("contactAddress", "Postal address (optional)")}
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : "Save contact details"}
            </button>
            {message && <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-500">{message?.text ?? "Loading…"}</p>
      )}
    </section>
  );
}
