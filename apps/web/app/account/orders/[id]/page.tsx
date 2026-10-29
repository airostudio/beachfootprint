import { redirect } from "next/navigation";

// Orders are looked up by email + reference on /account/orders — never by id alone, which would
// let anyone who guessed an id see another customer's order.
export default function OrderDetailPage() {
  redirect("/account/orders");
}
