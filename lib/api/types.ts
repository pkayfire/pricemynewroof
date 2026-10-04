// Client-side types for the estimate API (docs/SPEC.md "API contracts and data model").
//
// MERGE NOTE: Milestone 2 (branch milestone-2-engine) owns the engine and POST /api/estimate.
// These types mirror its response shape so the frontend can be built in parallel. At merge,
// re-export the engine's own types from here (lib/engine/types.ts) and delete the duplicates;
// every frontend file imports estimate types only from this module.

export type OptionId = "architectural_shingle" | "concrete_tile" | "lift_and_relay";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type ImageryQuality = "HIGH" | "MEDIUM" | "LOW";
export type WageSource = "metro" | "state" | "national";
export type Confidence = "high" | "medium" | "low";
export type RoofShape = "simple" | "average" | "complex";

export const CURRENT_ROOFS = ["shingle", "tile", "metal", "flat", "other", "not_sure"] as const;
export type CurrentRoof = (typeof CURRENT_ROOFS)[number];

export type Fallback =
  | "home_size"
  | "imagery_medium"
  | "imagery_low"
  | "size_confirmed"
  | "wage_state"
  | "wage_national";

export type FallbackReason = "no_building" | "solar_error" | "out_of_range";

/** `measurements.segments[]` item. */
export interface Segment {
  letter: string;
  /** Rise per 12, e.g. "8/12". */
  pitch: string;
  /** Degrees clockwise from north that the plane faces (downhill). */
  azimuth: number;
  /** Nearest of 8 compass points ("North", "Northeast", …); null for a flat plane. */
  compass: string | null;
  areaSqft: number;
  center: LatLng | null;
}

export interface HomeSizeInput {
  homeSqft: number;
  stories: number;
  shape: RoofShape;
}

export interface Measurements {
  source: "solar" | "home_size";
  squares: number;
  totalAreaSqft: number;
  /** Planes of 50 sq ft or more, lettered A, B, C… largest first. */
  segments: Segment[];
  /** Planes under 50 sq ft, grouped as "Other". */
  other: { count: number; areaSqft: number } | null;
  segmentCount: number;
  maxPitch: string | null;
  imageryQuality: ImageryQuality | null;
  /** YYYY-MM-DD or YYYY-MM. */
  imageryDate: string | null;
  buildingCenter: LatLng | null;
  homeSize: HomeSizeInput | null;
}

/** `options[]` item; prices are integers in dollars. */
export interface EstimateOption {
  id: OptionId;
  name: string;
  low: number;
  high: number;
  note: string | null;
}

export interface Drivers {
  squares: number;
  sections: number | null;
  complexity: RoofShape;
  steepShare: number;
  maxPitch: string | null;
  areaName: string;
  wageSource: WageSource;
  laborVsNational: number;
  materialTrendSinceBase: number;
  sharesOption: OptionId;
  shares: { labor: number; materials: number; other: number };
  confidence: Confidence;
  fallbacks: Fallback[];
}

export interface Coverage {
  covered: boolean;
  trackingNumber?: string | null;
  leadTypes: string[];
}

/** Request body for POST /api/estimate. */
export interface EstimateRequest {
  placeId: string;
  currentRoof?: CurrentRoof;
  fallback?: HomeSizeInput;
}

/** Response from POST /api/estimate. */
export interface EstimateResponse {
  estimateId: string;
  needsFallback: boolean;
  reason?: FallbackReason;
  measurements: Measurements | null;
  options: EstimateOption[];
  drivers: Drivers | null;
  configVersion: number;
  coverage: Coverage | null;
}

/**
 * What the estimate page reads for /estimate/[id]: the stored estimate row
 * (`estimates` table) in the shape the UI needs.
 */
export interface StoredEstimate {
  estimateId: string;
  createdAt: string;
  /** created_at + 30 days; measurements and address are purged after this. */
  expiresAt: string;
  placeId: string;
  zip: string;
  /** Two-letter state code, used for state-level area wording. */
  state: string;
  /** Formatted address; null once purged (then the page shows the ZIP only). */
  formattedAddress: string | null;
  currentRoof: CurrentRoof | null;
  needsFallback: boolean;
  reason: FallbackReason | null;
  /** Null once purged at 30 days (Google caching limit). */
  measurements: Measurements | null;
  options: EstimateOption[];
  drivers: Drivers | null;
  configVersion: number;
  coverage: Coverage | null;
}

/** Response from GET /api/explanation/[id]. */
export interface ExplanationResponse {
  text: string;
  source: "llm" | "template";
}
