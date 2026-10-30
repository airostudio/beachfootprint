"use client";

import { createContext, useContext, useState } from "react";

interface ProductImageState {
  /** An image the variant picker wants shown in the main gallery slot (a colour's photo), or null. */
  selectedImage: string | null;
  setSelectedImage: (url: string | null) => void;
}

const ProductImageContext = createContext<ProductImageState | null>(null);

/** Shared by the gallery and the variant picker on a product page, which sit side by side. */
export function ProductImageProvider({ children }: { children: React.ReactNode }) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  return <ProductImageContext.Provider value={{ selectedImage, setSelectedImage }}>{children}</ProductImageContext.Provider>;
}

/** Null outside a provider, so either component still works on its own. */
export function useProductImage(): ProductImageState | null {
  return useContext(ProductImageContext);
}
