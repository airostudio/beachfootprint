"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import {
  evaluateAvailability,
  priceConfiguration,
  buildConfigurationRecord,
  type DollConfiguratorModel,
} from "@trend/core";
import { formatMoney } from "@/lib/format";

export default function DollConfigurator({ model }: { model: DollConfiguratorModel }) {
  const steps = useMemo(() => [...model.groups, { key: "review", label: "Review", isRequired: false, isMultiSelect: false, options: [] }], [model]);
  const [stepIndex, setStepIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string[]>>(() => {
    const initial: Record<string, string[]> = {};
    for (const g of model.groups) {
      const def = g.options.find((o) => o.isDefault);
      if (g.isRequired && def) initial[g.key] = [def.id];
    }
    return initial;
  });
  const [added, setAdded] = useState(false);

  const selectedIds = new Set(Object.values(selected).flat());
  const availability = evaluateAvailability(model, selectedIds);
  const pricing = priceConfiguration(model, selectedIds);

  const currentStep = steps[stepIndex];
  const isReview = currentStep.key === "review";

  function toggleOption(groupKey: string, optionId: string, multi: boolean) {
    setSelected((prev) => {
      const current = prev[groupKey] ?? [];
      if (multi) {
        const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
        return { ...prev, [groupKey]: next };
      }
      return { ...prev, [groupKey]: [optionId] };
    });
  }

  function canAdvance() {
    if (isReview) return true;
    const group = model.groups.find((g) => g.key === currentStep.key);
    if (!group?.isRequired) return true;
    return (selected[group.key]?.length ?? 0) > 0;
  }

  const configuration = buildConfigurationRecord(
    model,
    Object.entries(selected).map(([groupKey, optionIds]) => ({ groupKey, optionIds })),
  );

  const selectedLabelsByGroup = model.groups.map((g) => ({
    group: g.label,
    labels: (selected[g.key] ?? []).map((id) => g.options.find((o) => o.id === id)?.label).filter(Boolean),
  }));

  const previewImage = model.groups
    .flatMap((g) => g.options)
    .find((o) => selectedIds.has(o.id) && o.imageUrl)?.imageUrl;

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-12">
      <div>
        <div className="flex flex-wrap gap-2 mb-8">
          {steps.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setStepIndex(i)}
              className={`px-3 py-1.5 text-xs tracking-widest2 uppercase border ${
                i === stepIndex ? "border-ink-950 bg-ink-950 text-warm-50" : "border-stone-300 text-stone-500"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>

        {!isReview ? (
          <div>
            <h2 className="font-serif text-3xl mb-2">{currentStep.label}</h2>
            <p className="text-sm text-stone-500 mb-8">
              {"isRequired" in currentStep && currentStep.isRequired ? "Required" : "Optional"}
              {"isMultiSelect" in currentStep && currentStep.isMultiSelect ? " · Select any that apply" : " · Select one"}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {"options" in currentStep &&
                currentStep.options.map((option) => {
                  const groupAvail = availability.find((a) => a.groupKey === currentStep.key);
                  const disallowed = groupAvail?.disallowedOptionIds.includes(option.id);
                  const isSelected = (selected[currentStep.key] ?? []).includes(option.id);
                  return (
                    <button
                      key={option.id}
                      disabled={disallowed || !option.isActive}
                      onClick={() => toggleOption(currentStep.key, option.id, "isMultiSelect" in currentStep && !!currentStep.isMultiSelect)}
                      className={`text-left border p-3 transition-colors ${
                        isSelected ? "border-ink-950 bg-stone-100" : "border-stone-200"
                      } ${disallowed ? "opacity-30 cursor-not-allowed" : "hover:border-ink-500"}`}
                    >
                      {option.imageUrl && (
                        <div className="relative aspect-square mb-2 bg-stone-200">
                          <Image src={option.imageUrl} alt={option.label} fill sizes="150px" className="object-cover" />
                        </div>
                      )}
                      <p className="text-sm">{option.label}</p>
                      {option.priceDelta !== 0 && (
                        <p className="text-xs text-stone-500">
                          {option.priceDelta > 0 ? "+" : ""}
                          {formatMoney(option.priceDelta)}
                        </p>
                      )}
                      {disallowed && <p className="text-[10px] text-red-600 mt-1">Not compatible with current selection</p>}
                    </button>
                  );
                })}
            </div>

            {availability.find((a) => a.groupKey === currentStep.key)?.missingRequirements.map((m) => (
              <p key={m} className="text-xs text-red-600 mt-4">
                {m}
              </p>
            ))}
          </div>
        ) : (
          <div>
            <h2 className="font-serif text-3xl mb-6">Review Your Configuration</h2>
            <dl className="divide-y divide-stone-200 border-t border-b border-stone-200">
              {selectedLabelsByGroup
                .filter((g) => g.labels.length > 0)
                .map((g) => (
                  <div key={g.group} className="flex justify-between py-3 text-sm">
                    <dt className="text-stone-500">{g.group}</dt>
                    <dd>{g.labels.join(", ")}</dd>
                  </div>
                ))}
            </dl>
            <p className="text-xs text-stone-500 mt-4">Estimated production time: {configuration.productionDays} days</p>

            <button
              className="btn-primary mt-8"
              onClick={() => setAdded(true)}
              disabled={availability.some((a) => a.missingRequirements.length > 0)}
            >
              {added ? "Added to Cart ✓" : "Add Configured Doll to Cart"}
            </button>
          </div>
        )}

        <div className="flex justify-between mt-10">
          <button className="btn-ghost" disabled={stepIndex === 0} onClick={() => setStepIndex((i) => Math.max(0, i - 1))}>
            Back
          </button>
          {!isReview && (
            <button className="btn-secondary" disabled={!canAdvance()} onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}>
              Next
            </button>
          )}
        </div>
      </div>

      <aside className="lg:sticky lg:top-24 h-fit border border-stone-200 p-6">
        {previewImage && (
          <div className="relative aspect-[4/5] mb-6 bg-stone-200">
            <Image src={previewImage} alt="Configuration preview" fill sizes="360px" className="object-cover" />
          </div>
        )}
        <p className="eyebrow mb-4">Running Total</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-stone-500">Base price</span>
            <span>{formatMoney(model.basePrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Options</span>
            <span>{formatMoney(pricing.optionsPrice)}</span>
          </div>
          <div className="flex justify-between text-base font-medium pt-3 border-t border-stone-200">
            <span>Total</span>
            <span>{formatMoney(pricing.totalPrice)}</span>
          </div>
        </div>
        <p className="text-xs text-stone-500 mt-4">Estimated production: {pricing.productionDays} days</p>
      </aside>
    </div>
  );
}
