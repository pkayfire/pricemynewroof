// Synthetic demo estimates for local rendering and screenshots (no real addresses).
// Prices follow the spec formula with config-v1 inputs; coordinates are invented and sit on
// open, non-residential land so the markers never label a real home.
//
// MERGE NOTE: Milestone 2's EstimateStore replaces these as the page's data source. They can stay
// as demo data (e.g. for screenshots) but must never be served in production.
import type { Coverage, LatLng, Segment, StoredEstimate } from "@/lib/api/types";
import { compassFromAzimuth } from "@/lib/format";

// DECISION: one invented point (open desert, no buildings) for every demo estimate.
const DEMO_CENTER: LatLng = { latitude: 33.30212, longitude: -112.12884 };

const M_PER_DEG_LAT = 111_320;
function offset(eastM: number, northM: number): LatLng {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((DEMO_CENTER.latitude * Math.PI) / 180);
  return {
    latitude: Number((DEMO_CENTER.latitude + northM / M_PER_DEG_LAT).toFixed(7)),
    longitude: Number((DEMO_CENTER.longitude + eastM / mPerDegLng).toFixed(7)),
  };
}

/** [areaSqft, rise per 12, azimuth, east m, north m] */
type SegSpec = [number, number, number, number, number];
function segments(specs: SegSpec[]): Segment[] {
  return specs.map(([areaSqft, rise, azimuth, e, n], i) => ({
    letter: String.fromCharCode(65 + i),
    pitch: `${rise}/12`,
    azimuth,
    compass: rise === 0 ? null : compassFromAzimuth(azimuth),
    areaSqft,
    center: offset(e, n),
  }));
}

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-03T18:00:00Z");
const created = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();
const expires = (daysAgo: number) => new Date(NOW - daysAgo * DAY + 30 * DAY).toISOString();

const covered: Coverage = { covered: true, trackingNumber: null, leadTypes: ["roof_replacement"] };
const notCovered: Coverage = { covered: false, trackingNumber: null, leadTypes: [] };

const NOTES = {
  architectural_shingle: "Full tear-off, new underlayment and architectural shingles.",
  concrete_tile: "Full tear-off, new tile and underlayment.",
  lift_and_relay: "Tiles lifted and relaid on new underlayment. Works if most tiles are sound.",
} as const;

// ---- 1. Covered metro, high confidence, shingle first (Ohio is not a tile state) ----
const columbusSegments = segments([
  [520, 8, 0, 0, 3],
  [520, 8, 180, 0, -3],
  [260, 4, 0, 12, 2.2],
  [260, 4, 180, 12, -2.2],
  [210, 6, 270, -8, 0],
  [210, 6, 90, 6.5, 0],
]);

const demoCovered: StoredEstimate = {
  estimateId: "demo-covered",
  createdAt: created(1),
  expiresAt: expires(1),
  placeId: "demo-place-covered",
  zip: "43000",
  state: "OH",
  formattedAddress: "100 Sample Street, Exampleton, OH 43000",
  currentRoof: "shingle",
  needsFallback: false,
  reason: null,
  measurements: {
    source: "solar",
    squares: 20.4,
    totalAreaSqft: 2040,
    segments: columbusSegments,
    other: { count: 2, areaSqft: 60 },
    segmentCount: 8,
    maxPitch: "8/12",
    imageryQuality: "HIGH",
    imageryDate: "2025-06-14",
    buildingCenter: DEMO_CENTER,
    homeSize: null,
  },
  options: [
    { id: "architectural_shingle", name: "Architectural shingle", low: 12500, high: 21500, note: NOTES.architectural_shingle },
    { id: "concrete_tile", name: "New concrete tile", low: 22500, high: 41000, note: NOTES.concrete_tile },
  ],
  drivers: {
    squares: 20.4,
    sections: 6,
    complexity: "average",
    steepShare: 0.51,
    maxPitch: "8/12",
    areaName: "Columbus",
    wageSource: "metro",
    laborVsNational: -0.11,
    materialTrendSinceBase: 0,
    sharesOption: "architectural_shingle",
    shares: { labor: 0.48, materials: 0.29, other: 0.23 },
    confidence: "high",
    fallbacks: [],
  },
  configVersion: 1,
  coverage: covered,
};

// ---- 2. Tile state, not covered; lift and relay first → low confidence ----
const demoNoCoverage: StoredEstimate = {
  estimateId: "demo-no-coverage",
  createdAt: created(2),
  expiresAt: expires(2),
  placeId: "demo-place-no-coverage",
  zip: "85000",
  state: "AZ",
  formattedAddress: "200 Example Avenue, Sampleville, AZ 85000",
  currentRoof: "tile",
  needsFallback: false,
  reason: null,
  measurements: {
    source: "solar",
    squares: 24.6,
    totalAreaSqft: 2460,
    segments: segments([
      [560, 5, 15, 0.8, 3.2],
      [540, 5, 195, -0.8, -3.2],
      [300, 5, 105, 8.5, -2.3],
      [290, 5, 285, -8.5, 2.3],
      [220, 4, 15, 13.5, 6.5],
      [200, 4, 195, 12, 0.5],
      [130, 4, 105, -3.5, -10],
      [120, 4, 285, -11.5, -8],
      [55, 3, 195, 4, -10.5],
    ]),
    other: { count: 2, areaSqft: 45 },
    segmentCount: 11,
    maxPitch: "5/12",
    imageryQuality: "HIGH",
    imageryDate: "2025-03-02",
    buildingCenter: DEMO_CENTER,
    homeSize: null,
  },
  options: [
    { id: "lift_and_relay", name: "Tile lift and relay", low: 14000, high: 24000, note: NOTES.lift_and_relay },
    { id: "concrete_tile", name: "New concrete tile", low: 26500, high: 48000, note: NOTES.concrete_tile },
    { id: "architectural_shingle", name: "Architectural shingle", low: 14500, high: 24000, note: NOTES.architectural_shingle },
  ],
  drivers: {
    squares: 24.6,
    sections: 9,
    complexity: "complex",
    steepShare: 0,
    maxPitch: "5/12",
    areaName: "Phoenix-Mesa-Chandler",
    wageSource: "metro",
    laborVsNational: -0.14,
    materialTrendSinceBase: 0,
    sharesOption: "lift_and_relay",
    shares: { labor: 0.6, materials: 0.22, other: 0.18 },
    confidence: "low",
    fallbacks: [],
  },
  configVersion: 1,
  coverage: notCovered,
};

// ---- 3. Medium imagery (±10%), covered ----
const demoMediumImagery: StoredEstimate = {
  estimateId: "demo-medium-imagery",
  createdAt: created(3),
  expiresAt: expires(3),
  placeId: "demo-place-medium",
  zip: "44000",
  state: "OH",
  formattedAddress: "300 Placeholder Road, Testburg, OH 44000",
  currentRoof: "not_sure",
  needsFallback: false,
  reason: null,
  measurements: {
    source: "solar",
    squares: 17.8,
    totalAreaSqft: 1780,
    segments: segments([
      [655, 6, 350, 0, 3],
      [655, 6, 170, 0, -3],
      [200, 6, 80, 8, 0],
      [180, 6, 260, -8, 0],
    ]),
    other: { count: 2, areaSqft: 90 },
    segmentCount: 6,
    maxPitch: "6/12",
    imageryQuality: "MEDIUM",
    imageryDate: "2024-09",
    buildingCenter: DEMO_CENTER,
    homeSize: null,
  },
  options: [
    { id: "architectural_shingle", name: "Architectural shingle", low: 10000, high: 20000, note: NOTES.architectural_shingle },
    { id: "concrete_tile", name: "New concrete tile", low: 18000, high: 40000, note: NOTES.concrete_tile },
  ],
  drivers: {
    squares: 17.8,
    sections: 4,
    complexity: "average",
    steepShare: 0,
    maxPitch: "6/12",
    areaName: "Akron",
    wageSource: "metro",
    laborVsNational: -0.01,
    materialTrendSinceBase: 0,
    sharesOption: "architectural_shingle",
    shares: { labor: 0.54, materials: 0.3, other: 0.16 },
    confidence: "medium",
    fallbacks: ["imagery_medium"],
  },
  configVersion: 1,
  coverage: covered,
};

// ---- 4. Low confidence: low imagery (±20%) + state wage; not covered ----
const demoLowConfidence: StoredEstimate = {
  estimateId: "demo-low-confidence",
  createdAt: created(4),
  expiresAt: expires(4),
  placeId: "demo-place-low",
  zip: "59000",
  state: "MT",
  formattedAddress: "400 Demo Lane, Mockford, MT 59000",
  currentRoof: "shingle",
  needsFallback: false,
  reason: null,
  measurements: {
    source: "solar",
    squares: 28.9,
    totalAreaSqft: 2890,
    segments: segments([
      [720, 10, 0, 0, 3.5],
      [590, 10, 180, 0, -3.5],
      [360, 5, 90, 10, 0],
      [340, 5, 270, -10, 0],
      [280, 5, 0, 15, 8],
      [230, 5, 180, 15, -8],
      [150, 4, 90, -15, 7],
      [90, 4, 270, -17, -6],
      [70, 4, 0, 4, 10],
    ]),
    other: { count: 3, areaSqft: 60 },
    segmentCount: 12,
    maxPitch: "10/12",
    imageryQuality: "LOW",
    imageryDate: "2023-07-21",
    buildingCenter: DEMO_CENTER,
    homeSize: null,
  },
  options: [
    { id: "architectural_shingle", name: "Architectural shingle", low: 16000, high: 40000, note: NOTES.architectural_shingle },
    { id: "concrete_tile", name: "New concrete tile", low: 28500, high: 78000, note: NOTES.concrete_tile },
  ],
  drivers: {
    squares: 28.9,
    sections: 9,
    complexity: "complex",
    steepShare: 0.45,
    maxPitch: "10/12",
    areaName: "Montana",
    wageSource: "state",
    laborVsNational: 0.06,
    materialTrendSinceBase: 0,
    sharesOption: "architectural_shingle",
    shares: { labor: 0.53, materials: 0.27, other: 0.2 },
    confidence: "low",
    fallbacks: ["imagery_low", "wage_state"],
  },
  configVersion: 1,
  coverage: notCovered,
};

// ---- 5. Home-size estimate (after the fallback form), national wage ----
const demoHomeSize: StoredEstimate = {
  estimateId: "demo-home-size",
  createdAt: created(1),
  expiresAt: expires(1),
  placeId: "demo-place-fallback",
  zip: "99000",
  state: "WA",
  formattedAddress: "500 Illustration Court, Nowhere, WA 99000",
  currentRoof: "shingle",
  needsFallback: false,
  reason: null,
  measurements: {
    source: "home_size",
    squares: 22.8,
    totalAreaSqft: 2280,
    segments: [],
    other: null,
    segmentCount: 0,
    maxPitch: null,
    imageryQuality: null,
    imageryDate: null,
    buildingCenter: null,
    homeSize: { homeSqft: 1800, stories: 1, shape: "average" },
  },
  options: [
    { id: "architectural_shingle", name: "Architectural shingle", low: 11000, high: 28000, note: NOTES.architectural_shingle },
    { id: "concrete_tile", name: "New concrete tile", low: 20000, high: 55500, note: NOTES.concrete_tile },
  ],
  drivers: {
    squares: 22.8,
    sections: null,
    complexity: "average",
    steepShare: 0,
    maxPitch: null,
    areaName: "U.S.",
    wageSource: "national",
    laborVsNational: 0,
    materialTrendSinceBase: 0,
    sharesOption: "architectural_shingle",
    shares: { labor: 0.54, materials: 0.29, other: 0.17 },
    confidence: "low",
    fallbacks: ["home_size", "wage_national"],
  },
  configVersion: 1,
  coverage: notCovered,
};

// ---- 6. No Solar coverage: the page asks home-size questions ----
const demoNeedsFallback: StoredEstimate = {
  estimateId: "demo-needs-fallback",
  createdAt: created(0),
  expiresAt: expires(0),
  placeId: "demo-place-fallback",
  zip: "99000",
  state: "WA",
  formattedAddress: "500 Illustration Court, Nowhere, WA 99000",
  currentRoof: null,
  needsFallback: true,
  reason: "no_building",
  measurements: null,
  options: [],
  drivers: null,
  configVersion: 1,
  coverage: null,
};

// ---- 7. Expired: measurements and address purged after 30 days ----
const demoExpired: StoredEstimate = {
  ...demoCovered,
  estimateId: "demo-expired",
  createdAt: created(41),
  expiresAt: expires(41),
  formattedAddress: null,
  measurements: null,
  options: [],
  drivers: null,
};

export const DEMO_ESTIMATES: readonly StoredEstimate[] = [
  demoCovered,
  demoNoCoverage,
  demoMediumImagery,
  demoLowConfidence,
  demoHomeSize,
  demoNeedsFallback,
  demoExpired,
];
