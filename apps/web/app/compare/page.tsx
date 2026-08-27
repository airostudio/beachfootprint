import { getAllProducts } from "@/lib/data/products";
import CompareClient from "./CompareClient";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const products = await getAllProducts();
  const dolls = products.filter((p) => p.productType === "silicone_doll");
  return <CompareClient dolls={dolls} />;
}
