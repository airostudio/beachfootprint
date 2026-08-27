import type { Metadata } from "next";
import DollConfigurator from "@/components/DollConfigurator";
import { getFirstConfigurableDollProduct } from "@/lib/data/products";

export const metadata: Metadata = {
  title: "Build Your Doll",
  description: "Design a fully configurable silicone companion — body, skin tone, face, eyes, hair and features — with a live running price.",
};

export const dynamic = "force-dynamic";

export default async function BuildYourDollPage() {
  const base = await getFirstConfigurableDollProduct();
  const model = base?.dollConfigurator;

  if (!model) {
    return <div className="container-page py-20 text-center text-stone-500">Configurator temporarily unavailable.</div>;
  }

  return (
    <div className="container-page py-14">
      <p className="eyebrow mb-3">Build Your Doll</p>
      <h1 className="font-serif text-4xl mb-2">Design a companion that's entirely yours</h1>
      <p className="text-stone-500 max-w-xl mb-12">
        Every option below is pulled from live configuration data — choices, compatibility rules and pricing are managed entirely by the merchant admin.
      </p>
      <DollConfigurator model={model} />
    </div>
  );
}
