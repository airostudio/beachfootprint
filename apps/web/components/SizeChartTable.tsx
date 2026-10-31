"use client";

import { useState } from "react";
import type { SizeChart } from "@/lib/sizeChart";

/** The supplier's size chart as a table, in centimetres or inches. */
export default function SizeChartTable({ chart, selectedSize }: { chart: SizeChart; selectedSize?: string | null }) {
  const hasInches = chart.rows.some((r) => Object.values(r.values).some((v) => v.inch));
  const [unit, setUnit] = useState<"cm" | "inch">("cm");

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-3">
        <p className="eyebrow">Size guide</p>
        {hasInches && (
          <div className="inline-flex border border-stone-300 text-xs" role="group" aria-label="Units">
            {(["cm", "inch"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                aria-pressed={unit === u}
                className={`px-3 py-1 transition-colors ${unit === u ? "bg-ink-950 text-warm-50" : "text-stone-600 hover:text-ink-950"}`}
              >
                {u === "cm" ? "cm" : "inches"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-ink-950 text-left">
              <th scope="col" className="py-2 pr-6 font-medium">
                Size
              </th>
              {chart.measures.map((m) => (
                <th key={m.key} scope="col" className="py-2 pr-6 font-medium">
                  {m.label} <span className="font-normal text-stone-500">({unit === "cm" ? "cm" : "in"})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.rows.map((row) => {
              const highlighted = selectedSize != null && row.size.toLowerCase() === selectedSize.toLowerCase();
              return (
                <tr key={row.size} className={`border-b border-stone-200 ${highlighted ? "bg-warm-100" : ""}`}>
                  <th scope="row" className="py-2.5 pr-6 font-medium text-ink-950 text-left">
                    {row.size}
                    {highlighted && <span className="ml-2 text-[10px] tracking-widest2 uppercase text-accent">Selected</span>}
                  </th>
                  {chart.measures.map((m) => {
                    const v = row.values[m.key];
                    const shown = unit === "cm" ? v?.cm : (v?.inch ?? null);
                    return (
                      <td key={m.key} className="py-2.5 pr-6 tabular-nums">
                        {shown ?? <span className="text-stone-400">—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500 mt-3 leading-relaxed">
        Measurements are the manufacturer&rsquo;s, taken from the garment. Where a range is given, the piece fits anywhere within it. Between sizes? Compare
        with something similar you already own.
      </p>
    </div>
  );
}
