// POST /api/estimate request flow (docs/SPEC.md, Estimate engine → Request flow). All network
// calls happen here, before the pure engine; dependencies are injected so tests use fixtures.
import type { BuiltConfig } from "@/config/lib/schema";
import { computeEstimate } from "@/lib/engine/estimate";
import { resolveLocationFactors } from "@/lib/engine/location";
import type { LatLng, RoofMeasurements } from "@/lib/engine/types";
import { GoogleApiError } from "@/lib/google/http";
import { PlaceError, type PlaceDetails } from "@/lib/google/places";
import type { SolarResult } from "@/lib/google/solar";
import type { CoverageProvider } from "@/lib/coverage";
import type { EstimateStore } from "./store";
import {
  estimateRequestSchema,
  type EstimateRecord,
  type EstimateResponse,
  type StoredPlace,
  type StoredSolar,
} from "./types";

/** Google Maps Platform caching limit for Solar-derived data and the address. */
export const GOOGLE_CACHE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EstimateDeps {
  store: EstimateStore;
  coverage: CoverageProvider;
  config: BuiltConfig;
  getPlace(placeId: string): Promise<PlaceDetails>;
  findBuilding(location: LatLng): Promise<SolarResult>;
  now(): Date;
  newId(): string;
  /** e.g. https://pricemynewroof.com, used for methodUrl and detailsUrl. */
  siteUrl: string;
}

export interface ErrorBody {
  error: "invalid_request" | "place_not_found" | "not_an_address" | "unsupported_location" | "upstream_error";
  message: string;
}

export type ServiceResult = { status: 200; body: EstimateResponse } | { status: 400 | 404 | 422 | 502; body: ErrorBody };

export async function handleEstimate(raw: unknown, deps: EstimateDeps): Promise<ServiceResult> {
  const parsed = estimateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      status: 400,
      body: { error: "invalid_request", message: `${first.path.join(".") || "body"}: ${first.message}` },
    };
  }
  const req = parsed.data;
  const now = deps.now();

  // 1. Reuse a stored Google measurement for this place (e.g. the user changed the current roof),
  //    so neither Places nor Solar is called again.
  // DECISION: reuse is keyed by placeId (any earlier estimate for the place within 30 days, not
  //    only the caller's), and reused data keeps its original expiry so it is never held > 30 days.
  const reusable = await deps.store.findReusable(req.placeId, now);
  let place: StoredPlace;
  let solar: StoredSolar | null = null;
  let expiresAt: string;
  if (reusable?.measurements) {
    place = reusable.measurements.place;
    solar = reusable.measurements.solar;
    expiresAt = reusable.expiresAt;
  } else {
    try {
      const p = await deps.getPlace(req.placeId);
      place = { formattedAddress: p.formattedAddress, location: p.location, zip: p.zip, city: p.city, state: p.state };
    } catch (e) {
      if (e instanceof PlaceError) {
        const status = e.code === "not_found" ? 404 : 422;
        const message =
          e.code === "unsupported_location" ? "Only US addresses are supported." : e.code === "not_found" ? "Address not found." : "Choose a street address.";
        return { status, body: { error: e.code === "not_found" ? "place_not_found" : e.code, message } };
      }
      if (e instanceof GoogleApiError) return { status: 502, body: { error: "upstream_error", message: "Address lookup failed." } };
      throw e;
    }
    expiresAt = new Date(now.getTime() + GOOGLE_CACHE_DAYS * DAY_MS).toISOString();
  }

  // 2. Measure. The home-size answers skip the Solar call entirely.
  let solarError = false;
  if (!req.fallback && solar === null) {
    let res: SolarResult;
    try {
      res = await deps.findBuilding(place.location);
    } catch (e) {
      if (e instanceof GoogleApiError) return { status: 502, body: { error: "upstream_error", message: "Roof measurement failed." } };
      throw e;
    }
    if (res.status === "ok") solar = res.measurements;
    else if (res.status === "not_found") solar = { source: "unavailable", reason: "no_building" };
    // DECISION: a transient Solar error falls back to the home-size questions (not stored as reusable).
    else solarError = true;
  }

  let input: RoofMeasurements;
  if (req.fallback) input = { source: "home_size", homeSize: req.fallback };
  else if (solarError || solar === null) input = { source: "unavailable", reason: "solar_error" };
  else if (solar.source === "solar") input = { ...solar, confirmedBuilding: req.confirmMeasurements === true };
  else input = solar;

  // 3–4. Location factors and the pure engine.
  const location = resolveLocationFactors(place.zip, place.state, deps.config);
  const result = computeEstimate(input, location, deps.config, {
    currentRoof: req.currentRoof,
    addressLocation: place.location,
    asOf: now.toISOString().slice(0, 10),
  });
  const coverage = await deps.coverage.forZip(place.zip);

  const id = deps.newId();
  const record: EstimateRecord = {
    id,
    createdAt: now.toISOString(),
    expiresAt,
    placeId: req.placeId,
    zip: place.zip,
    cbsa: location.cbsa,
    state: location.state,
    formattedAddress: place.formattedAddress,
    measurements: { place, solar, homeSize: req.fallback ?? null },
    needsFallback: result.needsFallback,
    fallbackReason: result.needsFallback ? result.reason : null,
    currentRoof: req.currentRoof ?? null,
    options: result.needsFallback ? null : result.options,
    drivers: result.needsFallback ? null : result.drivers,
    configVersion: result.configVersion,
    sessionId: req.sessionId ?? null,
    client: req.client,
  };
  await deps.store.insert(record);

  const site = deps.siteUrl.replace(/\/+$/, "");
  return {
    status: 200,
    body: {
      estimateId: id,
      needsFallback: result.needsFallback,
      fallbackReason: result.needsFallback ? result.reason : null,
      measurements: result.measurements,
      options: result.needsFallback ? [] : result.options,
      drivers: result.needsFallback ? null : result.drivers,
      locationText: result.needsFallback ? null : result.locationText,
      configVersion: result.configVersion,
      coverage,
      address: { formattedAddress: place.formattedAddress, zip: place.zip, state: location.state },
      currentRoof: req.currentRoof ?? null,
      client: req.client,
      methodUrl: `${site}/how-we-estimate`,
      detailsUrl: `${site}/estimate/${id}`,
    },
  };
}
