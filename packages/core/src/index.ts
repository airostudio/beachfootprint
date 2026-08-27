export * from "./types";
export * from "./providers/payment";
export * from "./providers/shipping";
export * from "./providers/email";
export * from "./providers/ai";
export * from "./providers/adapters/mock-payment";
export * from "./providers/adapters/stripe-payment";
export * from "./providers/adapters/flat-rate-shipping";
export * from "./providers/adapters/console-email";
export * from "./providers/adapters/deterministic-ai";
export * from "./doll-config";
export * from "./csv";
export * from "./transformer";
// aliexpress/ and fulfillment/ are server-only (node:crypto signing,
// @supabase/supabase-js) and deliberately NOT re-exported here — this
// barrel is imported by client components (e.g. DollConfigurator.tsx),
// and bundling node:crypto into the browser breaks the build. Import
// them from "@trend/core/aliexpress" / "@trend/core/fulfillment" instead.
