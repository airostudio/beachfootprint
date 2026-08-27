"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Optional discreet-browsing wrapper: when a customer has this preference
 * enabled, product imagery renders blurred behind a neutral "Reveal" action
 * instead of being shown by default. Reads a lightweight local preference
 * for demo purposes — production wires this to CustomerPrivacySettings.
 */
export default function DiscreetImage({ src, alt }: { src: string; alt: string }) {
  const [revealed, setRevealed] = useState(false);
  const [discreetEnabled, setDiscreetEnabled] = useState(false);

  return (
    <div className="relative">
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-stone-200">
        <Image src={src} alt={alt} fill className={`object-cover transition-all ${discreetEnabled && !revealed ? "blur-2xl scale-110" : ""}`} />
        {discreetEnabled && !revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center bg-ink-950/30 text-warm-50 text-sm tracking-widest2 uppercase"
          >
            Reveal Image
          </button>
        )}
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-stone-500">
        <input type="checkbox" checked={discreetEnabled} onChange={(e) => { setDiscreetEnabled(e.target.checked); setRevealed(false); }} />
        Enable discreet browsing on this device
      </label>
    </div>
  );
}
