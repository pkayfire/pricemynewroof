import type { Drivers } from "@/lib/api/types";

/** The spec's drivers example (Arizona, lift and relay first). */
export const SPEC_DRIVERS: Drivers = {
  squares: 20.4,
  sections: 9,
  complexity: "average",
  steepShare: 0.3,
  maxPitch: "8/12",
  areaName: "Phoenix",
  wageSource: "metro",
  laborVsNational: -0.08,
  materialTrendSinceBase: 0.03,
  sharesOption: "lift_and_relay",
  shares: { labor: 0.59, materials: 0.2, other: 0.21 },
  confidence: "high",
  fallbacks: [],
};

export const STATE_DRIVERS: Drivers = {
  ...SPEC_DRIVERS,
  areaName: "Montana",
  wageSource: "state",
  laborVsNational: 0.06,
  confidence: "medium",
  fallbacks: ["wage_state"],
};

export const NATIONAL_HOME_SIZE_DRIVERS: Drivers = {
  ...SPEC_DRIVERS,
  squares: 22.8,
  sections: null,
  steepShare: 0,
  maxPitch: null,
  areaName: "U.S.",
  wageSource: "national",
  laborVsNational: 0,
  confidence: "low",
  fallbacks: ["home_size", "wage_national"],
};

export const FLAT_METRO_DRIVERS: Drivers = {
  ...SPEC_DRIVERS,
  areaName: "Los Angeles-Long Beach-Anaheim",
  steepShare: 0,
  maxPitch: "4/12",
  laborVsNational: 0.27,
};
