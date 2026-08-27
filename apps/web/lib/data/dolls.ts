import "server-only";
import type { DollConfiguratorModel, DollOptionGroupInput, DollOptionInput, DollOptionRuleInput, RuleEffect } from "@trend/core";
import { db } from "./client";

interface DollModelRow {
  id: string;
  product_id: string;
}
interface GroupRow {
  id: string;
  key: string;
  label: string;
  is_required: boolean;
  is_multiselect: boolean;
}
interface OptionRow {
  id: string;
  group_id: string;
  code: string;
  label: string;
  image_url: string | null;
  price_delta: number;
  production_days_delta: number;
  is_default: boolean;
  is_active: boolean;
}
interface RuleRow {
  condition_option_id: string;
  effect: string;
  target_group_key: string | null;
  target_option_codes: string[];
  price_delta: number | null;
  lead_time_days_delta: number | null;
}

/** Loads the full doll configurator (groups, options, rules) for one product, or undefined if it isn't a configurable doll. */
export async function getDollConfiguratorForProduct(productId: string): Promise<DollConfiguratorModel | undefined> {
  const supabase = db();
  const { data: model } = await supabase
    .from("doll_models")
    .select("id, product_id")
    .eq("product_id", productId)
    .maybeSingle();
  if (!model) return undefined;
  const dollModel = model as DollModelRow;

  const [{ data: variant }, { data: groupRows }] = await Promise.all([
    supabase.from("product_variants").select("price").eq("product_id", productId).eq("is_active", true).order("price").limit(1).maybeSingle(),
    supabase.from("doll_option_groups").select("id, key, label, is_required, is_multiselect").eq("doll_model_id", dollModel.id).order("position"),
  ]);

  const groups = (groupRows ?? []) as GroupRow[];
  if (groups.length === 0) return undefined;

  const groupIds = groups.map((g) => g.id);
  const { data: optionRows } = await supabase
    .from("doll_options")
    .select("id, group_id, code, label, image_url, price_delta, production_days_delta, is_default, is_active")
    .in("group_id", groupIds)
    .order("position");
  const options = (optionRows ?? []) as OptionRow[];

  const { data: ruleRows } = await supabase
    .from("doll_option_rules")
    .select("condition_option_id, effect, target_group_key, target_option_codes, price_delta, lead_time_days_delta")
    .eq("doll_model_id", dollModel.id);

  const groupByOptionId = new Map<string, string>();
  for (const opt of options) groupByOptionId.set(opt.id, groups.find((g) => g.id === opt.group_id)?.key ?? "");

  const optionInputsByGroup: DollOptionGroupInput[] = groups.map((g) => ({
    key: g.key,
    label: g.label,
    isRequired: g.is_required,
    isMultiSelect: g.is_multiselect,
    options: options
      .filter((o) => o.group_id === g.id)
      .map((o): DollOptionInput => ({
        id: o.id,
        groupKey: g.key,
        code: o.code,
        label: o.label,
        imageUrl: o.image_url ?? undefined,
        priceDelta: o.price_delta,
        productionDaysDelta: o.production_days_delta,
        isDefault: o.is_default,
        isActive: o.is_active,
      })),
  }));

  const rules: DollOptionRuleInput[] = ((ruleRows ?? []) as RuleRow[]).map((r) => ({
    conditionOptionId: r.condition_option_id,
    effect: r.effect as RuleEffect,
    targetGroupKey: r.target_group_key ?? undefined,
    targetOptionCodes: r.target_option_codes,
    priceDelta: r.price_delta ?? undefined,
    leadTimeDaysDelta: r.lead_time_days_delta ?? undefined,
  }));

  return {
    productId,
    basePrice: variant?.price ?? 0,
    baseProductionDays: 14,
    groups: optionInputsByGroup,
    rules,
  };
}
