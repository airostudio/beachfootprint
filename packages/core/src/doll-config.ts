/**
 * Structured configuration + rule evaluation for the doll builder, shared
 * between the storefront configurator and admin combination-validity tools.
 * Rules come from data (DollOptionRule rows), never scattered conditionals.
 */

export interface DollOptionInput {
  id: string;
  groupKey: string;
  code: string;
  label: string;
  imageUrl?: string;
  priceDelta: number;
  productionDaysDelta: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface DollOptionGroupInput {
  key: string;
  label: string;
  isRequired: boolean;
  isMultiSelect: boolean;
  options: DollOptionInput[];
}

export type RuleEffect = "allow_only" | "exclude" | "require" | "price_adjust" | "lead_time_adjust";

export interface DollOptionRuleInput {
  conditionOptionId: string;
  effect: RuleEffect;
  targetGroupKey?: string;
  targetOptionCodes: string[];
  priceDelta?: number;
  leadTimeDaysDelta?: number;
}

export interface DollConfiguratorModel {
  productId: string;
  basePrice: number;
  baseProductionDays: number;
  groups: DollOptionGroupInput[];
  rules: DollOptionRuleInput[];
}

export interface ConfigurationSelection {
  groupKey: string;
  optionIds: string[];
}

export interface DollConfiguration {
  modelId: string;
  selectedOptions: ConfigurationSelection[];
  basePrice: number;
  optionsPrice: number;
  totalPrice: number;
  productionDays: number;
}

export interface GroupAvailability {
  groupKey: string;
  disallowedOptionIds: string[]; // filtered out by allow_only/exclude rules from other selections
  missingRequirements: string[]; // human-readable notes for unmet "require" rules
}

/** Given the currently selected option ids (across all groups), compute per-group availability. */
export function evaluateAvailability(
  model: DollConfiguratorModel,
  selectedOptionIds: Set<string>,
): GroupAvailability[] {
  const optionById = new Map<string, DollOptionInput>();
  for (const g of model.groups) for (const o of g.options) optionById.set(o.id, o);

  const allowOnlyByGroup = new Map<string, Set<string>>();
  const excludeByGroup = new Map<string, Set<string>>();
  const missingByGroup = new Map<string, string[]>();

  for (const rule of model.rules) {
    if (!selectedOptionIds.has(rule.conditionOptionId)) continue;
    const conditionOption = optionById.get(rule.conditionOptionId);
    if (!rule.targetGroupKey) continue;

    if (rule.effect === "allow_only") {
      const set = allowOnlyByGroup.get(rule.targetGroupKey) ?? new Set<string>();
      rule.targetOptionCodes.forEach((c) => set.add(c));
      allowOnlyByGroup.set(rule.targetGroupKey, set);
    }
    if (rule.effect === "exclude") {
      const set = excludeByGroup.get(rule.targetGroupKey) ?? new Set<string>();
      rule.targetOptionCodes.forEach((c) => set.add(c));
      excludeByGroup.set(rule.targetGroupKey, set);
    }
    if (rule.effect === "require") {
      const group = model.groups.find((g) => g.key === rule.targetGroupKey);
      const hasOne = group?.options.some(
        (o) => rule.targetOptionCodes.includes(o.code) && selectedOptionIds.has(o.id),
      );
      if (!hasOne) {
        const list = missingByGroup.get(rule.targetGroupKey) ?? [];
        list.push(
          `${conditionOption?.label ?? "Selected option"} requires one of: ${rule.targetOptionCodes.join(", ")}`,
        );
        missingByGroup.set(rule.targetGroupKey, list);
      }
    }
  }

  return model.groups.map((g) => {
    const allowOnly = allowOnlyByGroup.get(g.key);
    const exclude = excludeByGroup.get(g.key) ?? new Set<string>();
    const disallowed = g.options
      .filter((o) => (allowOnly ? !allowOnly.has(o.code) : false) || exclude.has(o.code))
      .map((o) => o.id);
    return {
      groupKey: g.key,
      disallowedOptionIds: disallowed,
      missingRequirements: missingByGroup.get(g.key) ?? [],
    };
  });
}

/** Compute running price + lead time for the current selection, including rule-based adjustments. */
export function priceConfiguration(
  model: DollConfiguratorModel,
  selectedOptionIds: Set<string>,
): { optionsPrice: number; totalPrice: number; productionDays: number } {
  const optionById = new Map<string, DollOptionInput>();
  for (const g of model.groups) for (const o of g.options) optionById.set(o.id, o);

  let optionsPrice = 0;
  let extraDays = 0;

  for (const id of selectedOptionIds) {
    const option = optionById.get(id);
    if (!option) continue;
    optionsPrice += option.priceDelta;
    extraDays += option.productionDaysDelta;
  }

  for (const rule of model.rules) {
    if (!selectedOptionIds.has(rule.conditionOptionId)) continue;
    if (rule.effect === "price_adjust" && rule.priceDelta) optionsPrice += rule.priceDelta;
    if (rule.effect === "lead_time_adjust" && rule.leadTimeDaysDelta) extraDays += rule.leadTimeDaysDelta;
  }

  return {
    optionsPrice,
    totalPrice: model.basePrice + optionsPrice,
    productionDays: model.baseProductionDays + extraDays,
  };
}

export function buildConfigurationRecord(
  model: DollConfiguratorModel,
  selections: ConfigurationSelection[],
): DollConfiguration {
  const selectedIds = new Set(selections.flatMap((s) => s.optionIds));
  const { optionsPrice, totalPrice, productionDays } = priceConfiguration(model, selectedIds);
  return {
    modelId: model.productId,
    selectedOptions: selections,
    basePrice: model.basePrice,
    optionsPrice,
    totalPrice,
    productionDays,
  };
}
