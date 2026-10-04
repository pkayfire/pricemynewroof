// Solar API buildingInsights:findClosest (requiredQuality=LOW). Server only.
import { DEFAULT_TIMEOUT_MS, GoogleApiError, readGoogleError, type GoogleClientOptions } from "./http";
import type { ImageryQuality, LatLng, RawSegment, RoofMeasurements } from "@/lib/engine/types";

export const SOLAR_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest";

interface SolarLatLng {
  latitude?: number;
  longitude?: number;
}

export interface BuildingInsightsResponse {
  name?: string;
  center?: SolarLatLng;
  imageryDate?: { year?: number; month?: number; day?: number };
  imageryQuality?: string;
  postalCode?: string;
  administrativeArea?: string;
  regionCode?: string;
  solarPotential?: {
    wholeRoofStats?: { areaMeters2?: number; groundAreaMeters2?: number };
    roofSegmentStats?: Array<{
      // proto3 JSON omits zero values, so a flat plane may have no pitchDegrees.
      pitchDegrees?: number;
      azimuthDegrees?: number;
      stats?: { areaMeters2?: number; groundAreaMeters2?: number };
      center?: SolarLatLng;
      planeHeightAtCenterMeters?: number;
    }>;
  };
}

export type SolarResult =
  | { status: "ok"; measurements: Extract<RoofMeasurements, { source: "solar" }> }
  | { status: "not_found" }
  | { status: "error"; message: string; httpStatus: number | null };

const latLng = (p: SolarLatLng | undefined): LatLng | null =>
  p && typeof p.latitude === "number" && typeof p.longitude === "number"
    ? { latitude: p.latitude, longitude: p.longitude }
    : null;

/** DECISION: an unknown imagery quality (e.g. BASE) is treated as LOW, the widest range. */
export function imageryQualityOf(q: string | undefined): ImageryQuality {
  return q === "HIGH" || q === "MEDIUM" ? q : "LOW";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function imageryDateOf(d: BuildingInsightsResponse["imageryDate"]): string | null {
  if (!d?.year) return null;
  if (!d.month) return String(d.year);
  return d.day ? `${d.year}-${pad(d.month)}-${pad(d.day)}` : `${d.year}-${pad(d.month)}`;
}

/** Converts a buildingInsights response into engine measurements (segments may be empty). */
export function parseBuildingInsights(json: BuildingInsightsResponse): Extract<RoofMeasurements, { source: "solar" }> {
  const segments: RawSegment[] = (json.solarPotential?.roofSegmentStats ?? []).map((s) => ({
    areaM2: s.stats?.areaMeters2 ?? 0,
    pitchDegrees: s.pitchDegrees ?? 0,
    azimuthDegrees: s.azimuthDegrees ?? 0,
    center: latLng(s.center),
  }));
  return {
    source: "solar",
    segments,
    imageryQuality: imageryQualityOf(json.imageryQuality),
    imageryDate: imageryDateOf(json.imageryDate),
    buildingCenter: latLng(json.center),
  };
}

export async function findClosestBuilding(location: LatLng, opts: GoogleClientOptions): Promise<SolarResult> {
  const f = opts.fetchImpl ?? fetch;
  const url =
    `${SOLAR_URL}?location.latitude=${location.latitude}` +
    `&location.longitude=${location.longitude}&requiredQuality=LOW`;
  let res: Response;
  try {
    res = await f(url, {
      method: "GET",
      headers: { "X-Goog-Api-Key": opts.apiKey },
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (e) {
    return { status: "error", message: `Solar API request failed: ${(e as Error).name}`, httpStatus: null };
  }
  if (res.status === 404) return { status: "not_found" };
  if (!res.ok) {
    const err = await readGoogleError(res);
    if (res.status === 400 && err.status === "INVALID_ARGUMENT") {
      return { status: "error", message: `Solar API 400: ${err.message}`, httpStatus: 400 };
    }
    if (res.status === 403 || res.status === 401) {
      // Misconfiguration (key, API not enabled, billing): surface it rather than silently falling back.
      throw new GoogleApiError(`Solar API ${res.status}: ${err.message}`, res.status, err.status);
    }
    return { status: "error", message: `Solar API ${res.status}: ${err.message}`, httpStatus: res.status };
  }
  const measurements = parseBuildingInsights((await res.json()) as BuildingInsightsResponse);
  if (measurements.segments.length === 0) return { status: "not_found" };
  return { status: "ok", measurements };
}
