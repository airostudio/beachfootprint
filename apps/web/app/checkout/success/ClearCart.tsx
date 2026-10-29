"use client";

import { useEffect } from "react";
import { useCart } from "@/lib/cart";

/** Empties the cart once Stripe has the order — rendered only when the session really completed. */
export default function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
