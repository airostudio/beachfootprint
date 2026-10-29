"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Asks the dropship engine to poll AliExpress tracking for every in-flight order now, instead of
 * waiting for its scheduled run. Updates arrive through the engine webhook before the call returns.
 */
export default function SyncTrackingButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function sync() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/sync/tracking", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Tracking sync failed");
      setMessage({ ok: true, text: "Tracking synced." });
      router.refresh();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Tracking sync failed" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" className="btn-secondary text-xs px-3 py-1.5" disabled={busy} onClick={sync}>
        {busy ? "Syncing…" : "Sync tracking now"}
      </button>
      {message && <span className={`text-xs ${message.ok ? "text-green-700" : "text-red-600"}`}>{message.text}</span>}
    </span>
  );
}
