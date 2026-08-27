export interface CatalogSyncSummary {
  tenantId: string;
  productsChecked: number;
  variantsReconciled: number;
  priceChanges: number;
  productsMarkedOutOfStock: number;
  productsRestocked: number;
  errors: Array<{ supplierProductId: string; message: string }>;
}

export interface PlaceOrderResult {
  orderId: string;
  skipped: boolean;
  aliexpressOrderId: string | null;
  fulfillmentStatus: string | null;
}

export interface TrackingSyncSummary {
  tenantId: string;
  polled: number;
  shipped: number;
  delivered: number;
  errors: Array<{ orderId: string; message: string }>;
}

export interface ShippingConfirmationEvent {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  trackingUrl?: string;
}
