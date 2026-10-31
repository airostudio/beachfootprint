"use client";

import { useEffect, useRef } from "react";
import type { SizeChart } from "@/lib/sizeChart";
import SizeChartTable from "@/components/SizeChartTable";

/** "Size guide" link beside the size picker; opens the chart in a dialog with the picked size highlighted. */
export default function SizeGuideButton({ chart, selectedSize }: { chart: SizeChart; selectedSize?: string | null }) {
  const dialog = useRef<HTMLDialogElement>(null);

  // Clicking the backdrop (outside the panel) closes it, like Escape does.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if (e.target === el) el.close();
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, []);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="text-xs underline underline-offset-4 decoration-accent text-ink-800 hover:text-ink-950">
        Size guide
      </button>
      <dialog ref={dialog} className="w-[min(36rem,calc(100vw-2rem))] p-0 bg-warm-50 text-ink-900 backdrop:bg-ink-950/50" aria-label="Size guide">
        <div className="p-6 sm:p-8">
          <div className="flex justify-end -mt-2 -mr-2 mb-1">
            <button type="button" onClick={() => dialog.current?.close()} className="text-xs tracking-widest2 uppercase text-stone-500 hover:text-ink-950" autoFocus>
              Close
            </button>
          </div>
          <SizeChartTable chart={chart} selectedSize={selectedSize} />
        </div>
      </dialog>
    </>
  );
}
