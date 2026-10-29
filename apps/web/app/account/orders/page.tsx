import OrderLookup from "./OrderLookup";

// There are no customer sign-ins yet, so orders are found by the email they were placed under
// plus the order reference from the confirmation — enough to prove the order is theirs without an
// account, and rate-limited so references can't be guessed.
export default function OrdersPage() {
  return <OrderLookup />;
}
