// What /estimate/[id] renders, built from a stored EstimateRecord. Pure.
// Stored measurements hold the raw Solar segments; display measurements (lettered planes, pitch
// labels) are derived with the engine's own measurement code, so the page and the engine agree.
import {
  homeSizeSquares,
  measureSolarRoof,
  round,
  type CurrentRoof,
  type Drivers,
  type FallbackReason,
  type MeasurementsOut,
  type OptionOut,
} from "@/lib/engine";
import type { Coverage, EstimateRecord, StoredMeasurements } from "./types";

export interface EstimateView {
  estimateId: string;
  createdAt: string;
  expiresAt: string;
  placeId: string;
  zip: string;
  state: string;
  /** Null after the 30-day purge; the page then shows the ZIP only. */
  formattedAddress: string | null;
  currentRoof: CurrentRoof | null;
  needsFallback: boolean;
  reason: FallbackReason | null;
  /** Display measurements; null after the purge or when nothing was measured. */
  measurements: MeasurementsOut | null;
  options: OptionOut[];
  drivers: Drivers | null;
  configVersion: number;
  coverage: Coverage | null;
}

/** Display measurements from what was stored (home-size answers win over a stored Solar roof). */
export function displayMeasurements(stored: StoredMeasurements | null): MeasurementsOut | null {
  if (!stored) return null;
  if (stored.homeSize) {
    const squares = homeSizeSquares(stored.homeSize);
    return {
      source: "home_size",
      squares: round(squares, 1),
      totalAreaSqft: Math.round(squares * 100),
      segments: [],
      other: null,
      segmentCount: 0,
      maxPitch: null,
      imageryQuality: null,
      imageryDate: null,
      buildingCenter: null,
      homeSize: { ...stored.homeSize },
    };
  }
  const solar = stored.solar;
  if (!solar || solar.source !== "solar") return null;
  const roof = measureSolarRoof(solar.segments);
  if (roof.segmentCount === 0) return null;
  return {
    source: "solar",
    ...roof.out,
    imageryQuality: solar.imageryQuality,
    imageryDate: solar.imageryDate,
    buildingCenter: solar.buildingCenter,
    homeSize: null,
  };
}

export function toEstimateView(r: EstimateRecord, coverage: Coverage | null): EstimateView {
  return {
    estimateId: r.id,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    placeId: r.placeId,
    zip: r.zip,
    state: r.state,
    formattedAddress: r.formattedAddress,
    currentRoof: r.currentRoof,
    needsFallback: r.needsFallback,
    reason: r.fallbackReason,
    measurements: displayMeasurements(r.measurements),
    options: r.options ?? [],
    drivers: r.drivers,
    configVersion: r.configVersion,
    coverage,
  };
}

/** The fallback reasons where a roof was measured and the user can confirm it's their house. */
export const CONFIRMABLE_REASONS: ReadonlySet<FallbackReason> = new Set(["out_of_range", "far_building"]);

/**
 * Solar-derived data is purged at 30 days (Google caching limit; Build decisions).
 * Needs-fallback estimates without a measured roof never expire into the expired state.
 */
export function isExpired(view: EstimateView, now: Date = new Date()): boolean {
  const past = now.getTime() > Date.parse(view.expiresAt);
  if (view.needsFallback)
    return view.reason !== null && CONFIRMABLE_REASONS.has(view.reason) && (past || view.measurements === null);
  return past || view.measurements === null;
}
