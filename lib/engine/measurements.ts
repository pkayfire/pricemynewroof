// Measurement math (docs/SPEC.md, Estimate engine → Measurement math). Pure.
import type { HomeSizeInput, MeasurementsOut, RawSegment, RoofShape, SegmentOut } from "./types";

export const SQFT_PER_M2 = 10.764;
export const SMALL_SEGMENT_SQFT = 50;
export const SQUARES_MIN = 8;
export const SQUARES_MAX = 60;
/** Steeper than 6/12 counts as steep. */
export const STEEP_RISE = 6;

export const SHAPE_FACTOR: Record<RoofShape, number> = { simple: 1.0, average: 1.1, complex: 1.25 };
/** Overhang plus typical pitch, applied to the footprint in the home-size fallback. */
export const FOOTPRINT_TO_ROOF = 1.15;

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

export const round = (x: number, digits: number) => {
  const f = 10 ** digits;
  // Nudge by EPSILON so values like 0.125 round consistently.
  return Math.round((x + Math.sign(x) * Number.EPSILON) * f) / f;
};

/** Pitch as rise per 12 (unrounded). */
export const riseOf = (pitchDegrees: number) => 12 * Math.tan((pitchDegrees * Math.PI) / 180);

/** Whole-number rise used for display and for the steep test. */
export const roundedRise = (pitchDegrees: number) => Math.round(riseOf(pitchDegrees));

export const pitchLabel = (pitchDegrees: number) => `${roundedRise(pitchDegrees)}/12`;

/**
 * DECISION: a plane is steep when its displayed (whole-number) pitch is above 6/12, so a
 * plane shown as "6/12" is never charged the steep adder.
 */
export const isSteep = (pitchDegrees: number) => roundedRise(pitchDegrees) > STEEP_RISE;

export function compassOf(azimuthDegrees: number): (typeof COMPASS)[number] {
  const a = ((azimuthDegrees % 360) + 360) % 360;
  return COMPASS[Math.round(a / 45) % 8];
}

/** A, B, …, Z, AA, AB, … */
export function letterFor(index: number): string {
  let s = "";
  let n = index;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** waste = 0.10 if segments ≤ 4, 0.12 if 5–10, 0.15 if > 10. */
export function wasteFor(segmentCount: number): number {
  if (segmentCount <= 4) return 0.1;
  if (segmentCount <= 10) return 0.12;
  return 0.15;
}

/** Same thresholds as waste. */
export function complexityFor(segmentCount: number): RoofShape {
  if (segmentCount <= 4) return "simple";
  if (segmentCount <= 10) return "average";
  return "complex";
}

/** DECISION: the spec gives no waste for the home-size fallback; use the waste of the matching complexity. */
export const WASTE_BY_SHAPE: Record<RoofShape, number> = { simple: 0.1, average: 0.12, complex: 0.15 };

export interface SolarRoof {
  squares: number;
  steepSquares: number;
  segmentCount: number;
  out: Pick<MeasurementsOut, "segments" | "other" | "segmentCount" | "maxPitch" | "totalAreaSqft" | "squares">;
}

const squaresOfM2 = (m2: number) => (m2 * SQFT_PER_M2) / 100;

export function measureSolarRoof(segments: RawSegment[]): SolarRoof {
  const valid = segments.filter((s) => Number.isFinite(s.areaM2) && s.areaM2 > 0);
  const sumM2 = valid.reduce((acc, s) => acc + s.areaM2, 0);
  const squares = squaresOfM2(sumM2);
  const steepSquares = valid.filter((s) => isSteep(s.pitchDegrees)).reduce((acc, s) => acc + squaresOfM2(s.areaM2), 0);

  // Stable sort: largest first, ties keep the API's order (deterministic).
  const indexed = valid.map((s, i) => ({ s, i, sqft: s.areaM2 * SQFT_PER_M2 }));
  indexed.sort((a, b) => b.sqft - a.sqft || a.i - b.i);

  const big = indexed.filter((x) => x.sqft >= SMALL_SEGMENT_SQFT);
  const small = indexed.filter((x) => x.sqft < SMALL_SEGMENT_SQFT);

  const lettered: SegmentOut[] = big.map(({ s, sqft }, k) => {
    const rise = roundedRise(s.pitchDegrees);
    return {
      letter: letterFor(k),
      pitch: `${rise}/12`,
      pitchDegrees: round(s.pitchDegrees, 1),
      azimuth: Math.round(((s.azimuthDegrees % 360) + 360) % 360) % 360,
      compass: rise === 0 ? null : compassOf(s.azimuthDegrees),
      areaSqft: Math.round(sqft),
      center: s.center,
    };
  });

  const maxDeg = valid.reduce((m, s) => Math.max(m, s.pitchDegrees), -Infinity);

  return {
    squares,
    steepSquares,
    segmentCount: valid.length,
    out: {
      squares: round(squares, 1),
      totalAreaSqft: Math.round(sumM2 * SQFT_PER_M2),
      segments: lettered,
      other: small.length
        ? { count: small.length, areaSqft: Math.round(small.reduce((acc, x) => acc + x.sqft, 0)) }
        : null,
      segmentCount: valid.length,
      maxPitch: valid.length ? pitchLabel(maxDeg) : null,
    },
  };
}

/** footprint = homeSqft / stories; squares = footprint × 1.15 × shapeFactor / 100. */
export function homeSizeSquares(h: HomeSizeInput): number {
  const footprint = h.homeSqft / h.stories;
  return (footprint * FOOTPRINT_TO_ROOF * SHAPE_FACTOR[h.shape]) / 100;
}

export const outOfBounds = (squares: number) => squares < SQUARES_MIN || squares > SQUARES_MAX;
