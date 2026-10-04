// Types for the pure estimate engine: (measurements, locationFactors, config) → estimate.
import type { BuiltConfig, OptionId } from "@/config/lib/schema";

export type { BuiltConfig, OptionId };

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type ImageryQuality = "HIGH" | "MEDIUM" | "LOW";

/** One Solar API roof segment, as the engine needs it. */
export interface RawSegment {
  areaM2: number;
  pitchDegrees: number;
  azimuthDegrees: number;
  center: LatLng | null;
}

export const ROOF_SHAPES = ["simple", "average", "complex"] as const;
export type RoofShape = (typeof ROOF_SHAPES)[number];

export const CURRENT_ROOFS = ["shingle", "tile", "metal", "not_sure"] as const;
/** "What's on the roof now" choices (owner decision, matches the mockup); only "tile" changes the options. */
export type CurrentRoof = (typeof CURRENT_ROOFS)[number];

export interface HomeSizeInput {
  homeSqft: number;
  stories: number;
  shape: RoofShape;
}

/** Why the roof couldn't be measured from satellite data. */
export type FallbackReason =
  | "no_building" // Solar API 404 / no building / no roof segments
  | "solar_error" // Solar API failed for another reason
  | "out_of_range" // squares outside the sanity bounds (likely the wrong building)
  | "far_building"; // measured building is far from the address point (likely the wrong building)

export type RoofMeasurements =
  | {
      source: "solar";
      segments: RawSegment[];
      imageryQuality: ImageryQuality;
      /** YYYY-MM-DD (or YYYY-MM) of the imagery, when the API reports it. */
      imageryDate: string | null;
      buildingCenter: LatLng | null;
      /** The user confirmed the measured building (outside the size bounds or far from the address). */
      confirmedBuilding?: boolean;
    }
  | { source: "home_size"; homeSize: HomeSizeInput }
  | { source: "unavailable"; reason: Exclude<FallbackReason, "out_of_range" | "far_building"> };

export type WageSource = "metro" | "state" | "national";

/** Location inputs resolved from the ZIP via the config (see resolveLocationFactors). */
export interface LocationFactors {
  zip: string;
  state: string;
  cbsa: string | null;
  wageAreaKey: string;
  /** OEWS area kind: msa, nonmetro, state or national. */
  areaKind: "msa" | "nonmetro" | "state" | "national";
  /** Display name of the wage area (metro name, nonmetro area name, state name or "U.S."). */
  areaName: string;
  wageSource: WageSource;
  areaWage: number;
  nationalWage: number;
}

export interface EngineInputs {
  currentRoof?: CurrentRoof;
  /** The address point from Places; used to catch a measured building that is too far away. */
  addressLocation?: LatLng;
  /** Date the estimate is made (YYYY-MM-DD); used to judge imagery age. Omit to skip the age check. */
  asOf?: string;
}

export const FALLBACKS = [
  "home_size",
  "imagery_medium",
  "imagery_low",
  "size_confirmed",
  "building_confirmed",
  "imagery_old",
  "wage_state",
  "wage_national",
] as const;
export type Fallback = (typeof FALLBACKS)[number];

export interface SegmentOut {
  letter: string;
  /** Rise per 12, rounded to a whole number, e.g. "8/12". */
  pitch: string;
  pitchDegrees: number;
  /** Degrees clockwise from north the plane faces (downhill), rounded. */
  azimuth: number;
  /** Nearest of 8 compass points; null for a flat plane (0/12). */
  compass: string | null;
  areaSqft: number;
  center: LatLng | null;
}

export interface MeasurementsOut {
  source: "solar" | "home_size";
  /** Roof area in squares (100 sq ft), one decimal. */
  squares: number;
  totalAreaSqft: number;
  /** Planes of 50 sq ft or more, lettered A, B, C… largest first. */
  segments: SegmentOut[];
  /** Planes under 50 sq ft, grouped. */
  other: { count: number; areaSqft: number } | null;
  segmentCount: number;
  maxPitch: string | null;
  imageryQuality: ImageryQuality | null;
  imageryDate: string | null;
  buildingCenter: LatLng | null;
  homeSize: HomeSizeInput | null;
}

export interface OptionOut {
  id: OptionId;
  name: string;
  low: number;
  high: number;
  note: string | null;
}

export type Confidence = "high" | "medium" | "low";

export interface Drivers {
  squares: number;
  /** Planes of 50 sq ft or more; null for a home-size estimate. */
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

export interface EstimateResult {
  needsFallback: false;
  measurements: MeasurementsOut;
  options: OptionOut[];
  drivers: Drivers;
  /** "For the {areaName} area." / "For homes in {state}." / "Based on national averages." */
  locationText: string;
  configVersion: number;
}

export interface NeedsFallbackResult {
  needsFallback: true;
  reason: FallbackReason;
  /** Present for out_of_range and far_building so the UI can show what was measured and ask to confirm. */
  measurements: MeasurementsOut | null;
  configVersion: number;
}

export type EngineResult = EstimateResult | NeedsFallbackResult;
