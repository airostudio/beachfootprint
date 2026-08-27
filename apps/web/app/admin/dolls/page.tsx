import { getFirstConfigurableDollProduct } from "@/lib/data/products";

export const dynamic = "force-dynamic";

export default async function AdminDollsPage() {
  const doll = await getFirstConfigurableDollProduct();
  const model = doll?.dollConfigurator;

  return (
    <div>
      <h1 className="font-serif text-3xl mb-6">Doll Configurator</h1>
      <p className="text-sm text-stone-500 mb-8">
        Manage option groups, options and compatibility rules per doll model. Combination validity (e.g. "this head only fits these bodies") is
        enforced by the shared rules engine in <code>@trend/core</code>, so it's consistent between the storefront and admin previews.
      </p>

      {model ? (
        <div className="space-y-6">
          {model.groups.map((g) => (
            <div key={g.key} className="border border-stone-200 p-4">
              <p className="text-sm font-medium mb-3">
                {g.label} {g.isRequired ? "(required)" : "(optional)"}
              </p>
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => (
                  <span key={o.id} className="text-xs border border-stone-300 px-2 py-1">
                    {o.label} {o.priceDelta !== 0 ? `(${o.priceDelta > 0 ? "+" : ""}${(o.priceDelta / 100).toFixed(2)})` : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div className="border border-stone-200 p-4">
            <p className="text-sm font-medium mb-3">Compatibility Rules</p>
            <ul className="text-xs text-stone-500 space-y-1 list-disc pl-4">
              {model.rules.map((r, i) => (
                <li key={i}>
                  {r.effect} → {r.targetGroupKey}: {r.targetOptionCodes.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-stone-500 border border-stone-200 p-6">
          No configurable doll model yet — add a <code>doll_models</code> row (with option groups/options) for a published product to manage it here.
        </p>
      )}
    </div>
  );
}
