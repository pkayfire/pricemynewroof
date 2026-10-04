// Estimate API types for the frontend: re-exported from Milestone 2's engine and estimate types,
// plus the explanation response, which is owned here.
export {
  CURRENT_ROOFS,
  ROOF_SHAPES,
  type Confidence,
  type CurrentRoof,
  type Drivers,
  type Fallback,
  type FallbackReason,
  type HomeSizeInput,
  type ImageryQuality,
  type LatLng,
  type MeasurementsOut as Measurements,
  type OptionId,
  type OptionOut as EstimateOption,
  type RoofShape,
  type SegmentOut as Segment,
  type WageSource,
} from "@/lib/engine/types";
export type { Coverage, EstimateResponse } from "@/lib/estimates/types";
export type { EstimateView } from "@/lib/estimates/view";

/** Body for POST /api/estimate as the browser sends it (see estimateRequestSchema). */
export interface EstimateRequestBody {
  placeId: string;
  currentRoof?: import("@/lib/engine/types").CurrentRoof;
  fallback?: import("@/lib/engine/types").HomeSizeInput;
  confirmMeasurements?: boolean;
}

/** Response from GET /api/explanation/[id]. */
export interface ExplanationResponse {
  text: string;
  source: "llm" | "template";
}

// Lead, coverage, email, events, do-not-sell and attribution contracts (Milestone 4), and the
// versioned consent text, so the UI imports every API type from this one module.
export * from "./contracts";
export * from "./consent";
