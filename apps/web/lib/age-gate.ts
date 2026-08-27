export const AGE_GATE_COOKIE = "ts_age_verified";

/**
 * Configurable copy/behaviour for the age gate. In production this is read
 * from TenantSettings (ageGateEnabled, ageGateMinAge, ageGateHeadline, ...);
 * region-specific overrides come from ageGateRegionRules.
 *
 * IMPORTANT: this is a self-attestation gate, not a legal age-verification
 * service. It reduces inadvertent exposure and records consent, but must not
 * be represented to customers or regulators as verifying age. Where a
 * jurisdiction requires robust verification, integrate a dedicated
 * age-verification provider behind this same config surface.
 */
export const ageGateConfig = {
  enabled: true,
  minAge: 18,
  headline: "You must be 18 years or older to enter this website.",
  body: "This site contains products intended for adults only. By entering, you confirm you meet the minimum age required in your location.",
  cookieDays: 30,
};
