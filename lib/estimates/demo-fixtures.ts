// Synthetic demo estimates for local screenshots only (served when DEMO_ESTIMATES=1 outside
// production; see source.ts). Each one is a stored EstimateRecord whose options and drivers come
// from the real engine and config, so the page shows exactly what a live estimate would.
// Addresses are invented; ZIPs are real only so the wage lookup resolves to a metro.
import { loadConfig } from "@/lib/config/load";
import {
  computeEstimate,
  resolveLocationFactors,
  type CurrentRoof,
  type HomeSizeInput,
  type ImageryQuality,
  type LatLng,
  type RawSegment,
} from "@/lib/engine";
import type { Coverage, EstimateRecord, StoredMeasurements, StoredSolar } from "./types";
import { toEstimateView, type EstimateView } from "./view";

// DECISION (accepted): one invented point on an open public lawn (no buildings) for every demo
// estimate, so screenshots show sharp imagery without labeling anyone's home.
export const DEMO_CENTER: LatLng = { latitude: 40.78125, longitude: -73.9665 };

const M_PER_DEG_LAT = 111_320;
function offset(eastM: number, northM: number, from: LatLng = DEMO_CENTER): LatLng {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((from.latitude * Math.PI) / 180);
  return {
    latitude: Number((from.latitude + northM / M_PER_DEG_LAT).toFixed(7)),
    longitude: Number((from.longitude + eastM / mPerDegLng).toFixed(7)),
  };
}

/** [areaSqft, rise per 12, azimuth, east m, north m] */
type SegSpec = [number, number, number, number, number];
const raw = (specs: SegSpec[]): RawSegment[] =>
  specs.map(([sqft, rise, azimuth, e, n]) => ({
    areaM2: sqft / 10.764,
    pitchDegrees: (Math.atan(rise / 12) * 180) / Math.PI,
    azimuthDegrees: azimuth,
    center: offset(e, n),
  }));

const HIP_ROOF: SegSpec[] = [
  [520, 8, 0, 0, 3],
  [520, 8, 180, 0, -3],
  [260, 4, 0, 12, 2.2],
  [260, 4, 180, 12, -2.2],
  [210, 6, 270, -8, 0],
  [210, 6, 90, 6.5, 0],
  [32, 4, 90, 3, 5],
  [28, 4, 270, -3, 5],
];
const COMPLEX_ROOF: SegSpec[] = [
  [560, 5, 15, 0.8, 3.2],
  [540, 5, 195, -0.8, -3.2],
  [300, 5, 105, 8.5, -2.3],
  [290, 5, 285, -8.5, 2.3],
  [220, 4, 15, 13.5, 6.5],
  [200, 4, 195, 12, 0.5],
  [130, 4, 105, -3.5, -10],
  [120, 4, 285, -11.5, -8],
  [55, 3, 195, 4, -10.5],
  [25, 3, 15, 6, 9],
  [20, 3, 195, -6, 9],
];
const GABLE_ROOF: SegSpec[] = [
  [655, 6, 350, 0, 3],
  [655, 6, 170, 0, -3],
  [200, 6, 80, 8, 0],
  [180, 6, 260, -8, 0],
  [45, 6, 80, 4, 6],
  [45, 6, 260, -4, 6],
];
const STEEP_ROOF: SegSpec[] = [
  [720, 10, 0, 0, 3.5],
  [590, 10, 180, 0, -3.5],
  [360, 5, 90, 10, 0],
  [340, 5, 270, -10, 0],
  [280, 5, 0, 15, 8],
  [230, 5, 180, 15, -8],
  [150, 4, 90, -15, 7],
  [90, 4, 270, -17, -6],
  [70, 4, 0, 4, 10],
  [20, 4, 90, 2, 12],
  [20, 4, 270, -2, 12],
  [20, 4, 0, 0, 13],
];
/** A detached garage or shed: far below the 8-square sanity bound. */
const SMALL_ROOF: SegSpec[] = [
  [300, 5, 0, 0, 2],
  [300, 5, 180, 0, -2],
];

const COVERED: Coverage = { covered: true, leadTypes: ["form"] };
const NOT_COVERED: Coverage = { covered: false, leadTypes: [] };

interface DemoSpec {
  id: string;
  zip: string;
  state: string;
  address: string;
  coverage: Coverage;
  currentRoof?: CurrentRoof;
  roof?: SegSpec[];
  imageryQuality?: ImageryQuality;
  imageryDate?: string;
  /** Address point offset from the building, in meters east/north (far_building when > 40 m). */
  addressOffset?: [number, number];
  confirmed?: boolean;
  homeSize?: HomeSizeInput;
  noBuilding?: boolean;
  daysAgo?: number;
  purged?: boolean;
}

const SPECS: DemoSpec[] = [
  { id: "demo-covered", zip: "43215", state: "OH", address: "100 Sample Street, Exampleton, OH 43215", coverage: COVERED, currentRoof: "shingle", roof: HIP_ROOF, imageryDate: "2025-06-14" },
  { id: "demo-no-coverage", zip: "85004", state: "AZ", address: "200 Example Avenue, Sampleville, AZ 85004", coverage: NOT_COVERED, currentRoof: "tile", roof: COMPLEX_ROOF, imageryDate: "2025-03-02" },
  { id: "demo-medium-imagery", zip: "44308", state: "OH", address: "300 Placeholder Road, Testburg, OH 44308", coverage: COVERED, currentRoof: "not_sure", roof: GABLE_ROOF, imageryQuality: "MEDIUM", imageryDate: "2024-09" },
  // ZIP not in the crosswalk → the state wage (wageSource "state").
  { id: "demo-low-confidence", zip: "59000", state: "MT", address: "400 Demo Lane, Mockford, MT 59000", coverage: NOT_COVERED, currentRoof: "shingle", roof: STEEP_ROOF, imageryQuality: "LOW", imageryDate: "2023-07-21" },
  { id: "demo-old-imagery", zip: "43215", state: "OH", address: "150 Sample Street, Exampleton, OH 43215", coverage: COVERED, currentRoof: "shingle", roof: HIP_ROOF, imageryDate: "2019-05-10" },
  { id: "demo-out-of-range", zip: "43215", state: "OH", address: "600 Example Way, Exampleton, OH 43215", coverage: COVERED, currentRoof: "shingle", roof: SMALL_ROOF, imageryDate: "2025-06-14" },
  { id: "demo-far-building", zip: "43215", state: "OH", address: "700 Sample Court, Exampleton, OH 43215", coverage: COVERED, currentRoof: "shingle", roof: HIP_ROOF, imageryDate: "2025-06-14", addressOffset: [55, -30] },
  { id: "demo-building-confirmed", zip: "43215", state: "OH", address: "700 Sample Court, Exampleton, OH 43215", coverage: COVERED, currentRoof: "shingle", roof: HIP_ROOF, imageryDate: "2025-06-14", addressOffset: [55, -30], confirmed: true },
  { id: "demo-home-size", zip: "99000", state: "WA", address: "500 Illustration Court, Nowhere, WA 99000", coverage: NOT_COVERED, currentRoof: "shingle", homeSize: { homeSqft: 1800, stories: 1, shape: "average" } },
  { id: "demo-needs-fallback", zip: "99000", state: "WA", address: "500 Illustration Court, Nowhere, WA 99000", coverage: NOT_COVERED, noBuilding: true },
  { id: "demo-expired", zip: "43215", state: "OH", address: "100 Sample Street, Exampleton, OH 43215", coverage: COVERED, currentRoof: "shingle", roof: HIP_ROOF, imageryDate: "2025-06-14", daysAgo: 41, purged: true },
];

const DAY = 86_400_000;

export function buildDemoRecord(spec: DemoSpec, now: Date = new Date()): EstimateRecord {
  const config = loadConfig();
  const created = new Date(now.getTime() - (spec.daysAgo ?? 0) * DAY);
  const addressLocation = spec.addressOffset ? offset(spec.addressOffset[0], spec.addressOffset[1]) : DEMO_CENTER;
  const place = { formattedAddress: spec.address, location: addressLocation, zip: spec.zip, city: null, state: spec.state };

  let solar: StoredSolar | null = null;
  if (spec.roof) {
    solar = {
      source: "solar",
      segments: raw(spec.roof),
      imageryQuality: spec.imageryQuality ?? "HIGH",
      imageryDate: spec.imageryDate ?? null,
      buildingCenter: DEMO_CENTER,
    };
  } else if (spec.noBuilding) {
    solar = { source: "unavailable", reason: "no_building" };
  }

  const input = spec.homeSize
    ? ({ source: "home_size", homeSize: spec.homeSize } as const)
    : solar && solar.source === "solar"
      ? { ...solar, confirmedBuilding: spec.confirmed === true }
      : ({ source: "unavailable", reason: "no_building" } as const);

  const location = resolveLocationFactors(spec.zip, spec.state, config);
  const result = computeEstimate(input, location, config, {
    currentRoof: spec.currentRoof,
    addressLocation,
    asOf: created.toISOString().slice(0, 10),
  });
  const measurements: StoredMeasurements = { place, solar, homeSize: spec.homeSize ?? null };

  return {
    id: spec.id,
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + 30 * DAY).toISOString(),
    placeId: `demo-place-${spec.id}`,
    zip: spec.zip,
    cbsa: location.cbsa,
    state: location.state,
    formattedAddress: spec.purged ? null : spec.address,
    measurements: spec.purged ? null : measurements,
    needsFallback: result.needsFallback,
    fallbackReason: result.needsFallback ? result.reason : null,
    currentRoof: spec.currentRoof ?? null,
    options: result.needsFallback ? null : result.options,
    drivers: result.needsFallback ? null : result.drivers,
    configVersion: result.configVersion,
    sessionId: null,
    client: "web",
  };
}

export function demoEstimateRecords(now: Date = new Date()): EstimateRecord[] {
  return SPECS.map((s) => buildDemoRecord(s, now));
}

export async function demoEstimateViews(now: Date = new Date()): Promise<Map<string, EstimateView>> {
  const coverage = new Map(SPECS.map((s) => [s.id, s.coverage]));
  return new Map(demoEstimateRecords(now).map((r) => [r.id, toEstimateView(r, coverage.get(r.id) ?? null)]));
}
