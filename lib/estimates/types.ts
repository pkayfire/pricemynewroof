// Request, stored record and response for POST /api/estimate (docs/SPEC.md, API contracts and data model).
import { z } from "zod";
import {
  CURRENT_ROOFS,
  ROOF_SHAPES,
  type CurrentRoof,
  type Drivers,
  type FallbackReason,
  type HomeSizeInput,
  type LatLng,
  type MeasurementsOut,
  type OptionOut,
  type RoofMeasurements,
} from "@/lib/engine/types";

export const CLIENTS = ["web", "chatgpt", "claude", "api"] as const;
export type Client = (typeof CLIENTS)[number];

export const estimateRequestSchema = z
  .object({
    placeId: z.string().trim().min(1).max(512),
    currentRoof: z.enum(CURRENT_ROOFS).optional(),
    fallback: z
      .object({
        // DECISION: accepted home sizes are 400–15,000 sq ft and 1–4 stories; outside that is a 400.
        homeSqft: z.number().int().min(400).max(15000),
        stories: z.number().int().min(1).max(4),
        shape: z.enum(ROOF_SHAPES),
      })
      .strict()
      .optional(),
    /**
     * DECISION: not in the spec's contract. The user confirms a measurement outside the sanity
     * bounds (< 8 or > 60 squares) instead of answering the home-size questions.
     */
    confirmMeasurements: z.boolean().optional(),
    client: z.enum(CLIENTS).default("web"),
    /** DECISION: optional; the browser sends its attribution session ID so estimates join to events. */
    sessionId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;

/** What the Places lookup resolved (stored so a re-estimate needs no Google call). */
export interface StoredPlace {
  formattedAddress: string;
  location: LatLng;
  zip: string;
  city: string | null;
  state: string;
}

/**
 * Google-derived measurement for the place: the Solar roof, or a confirmed "no building".
 * A Solar error is never stored as reusable.
 */
export type StoredSolar =
  | Extract<RoofMeasurements, { source: "solar" }>
  | { source: "unavailable"; reason: "no_building" };

/** measurements_json: everything derived from Google, purged with the address at expires_at. */
export interface StoredMeasurements {
  place: StoredPlace;
  solar: StoredSolar | null;
  homeSize: HomeSizeInput | null;
}

export interface EstimateRecord {
  id: string;
  createdAt: string;
  /** When the Google-derived data (measurements_json, formatted address) must be purged. */
  expiresAt: string;
  placeId: string;
  zip: string;
  cbsa: string | null;
  state: string;
  /** Null after the 30-day purge. */
  formattedAddress: string | null;
  /** Null after the 30-day purge. */
  measurements: StoredMeasurements | null;
  needsFallback: boolean;
  fallbackReason: FallbackReason | null;
  currentRoof: CurrentRoof | null;
  options: OptionOut[] | null;
  drivers: Drivers | null;
  configVersion: number;
  sessionId: string | null;
  client: Client;
}

export interface Coverage {
  covered: boolean;
  trackingNumber?: string;
  leadTypes: string[];
}

export interface EstimateResponse {
  estimateId: string;
  needsFallback: boolean;
  /** Why the home-size questions are needed (only when needsFallback). */
  fallbackReason: FallbackReason | null;
  /** For out_of_range and far_building, the measured roof so the user can confirm it; null for no_building. */
  measurements: MeasurementsOut | null;
  options: OptionOut[];
  drivers: Drivers | null;
  /** "For the {areaName} area." etc., generated from data. */
  locationText: string | null;
  configVersion: number;
  coverage: Coverage;
  address: { formattedAddress: string; zip: string; state: string };
  currentRoof: CurrentRoof | null;
  client: Client;
  methodUrl: string;
  detailsUrl: string;
}
