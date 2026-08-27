"use client";

import { useEffect, useState } from "react";
import { AGE_GATE_COOKIE, ageGateConfig } from "@/lib/age-gate";

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function hasCookie(name: string): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

export default function AgeGate() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ageGateConfig.enabled) return;
    if (!hasCookie(AGE_GATE_COOKIE)) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-gate-heading"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950/95 backdrop-blur-sm p-4"
    >
      <div className="max-w-md w-full text-center text-warm-50">
        <p className="eyebrow text-stone-400 mb-6">Age Restricted</p>
        <h1 id="age-gate-heading" className="font-serif text-3xl sm:text-4xl mb-4 leading-tight">
          {ageGateConfig.headline}
        </h1>
        <p className="text-stone-300 text-sm leading-relaxed mb-10">{ageGateConfig.body}</p>
        <div className="flex flex-col gap-3">
          <button
            className="btn-primary bg-warm-50 text-ink-950 hover:bg-stone-200"
            onClick={() => {
              setCookie(AGE_GATE_COOKIE, "1", ageGateConfig.cookieDays);
              setVisible(false);
            }}
          >
            I am {ageGateConfig.minAge} or older
          </button>
          <a
            className="btn-secondary border-stone-400 text-stone-200 hover:bg-warm-50 hover:text-ink-950"
            href="https://www.google.com"
          >
            Leave Website
          </a>
        </div>
        <p className="text-xs text-stone-500 mt-8">
          This confirmation is a self-declaration and does not itself verify your age.
        </p>
      </div>
    </div>
  );
}
