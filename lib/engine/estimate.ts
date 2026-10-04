// The estimate engine: (measurements, locationFactors, config) → estimate.
// Pure and deterministic: no network, no clock, no randomness. See docs/SPEC.md, Estimate engine.
import type { OptionId } from "@/config/lib/schema";
import {
  complexityFor,
  homeSizeSquares,
  measureSolarRoof,
  outOfBounds,
  round,
  WASTE_BY_SHAPE,
  wasteFor,
} from "./measurements";
import type {
  BuiltConfig,
  Confidence,
  CurrentRoof,
  Drivers,
  EngineInputs,
  EngineResult,
  Fallback,
  LocationFactors,
  MeasurementsOut,
  OptionOut,
  RoofMeasurements,
  RoofShape,
  WageSource,
} from "./types";

export const LABOR_RATIO_MIN = 0.75;
export const LABOR_RATIO_MAX = 1.6;
export const ROUND_TO = 500;

/**
 * Range widening per fallback (fraction of the price, applied as low × (1 − w), high × (1 + w)).
 * Spec: home-size fallback ±20%, MEDIUM imagery ±10%, LOW imagery ±20%.
 * DECISION: the spec says every fallback widens the range but gives no figure for wage
 * fallbacks or a user-confirmed out-of-range size; they widen ±10%. Widenings add up.
 */
export const WIDENING: Record<Fallback, number> = {
  home_size: 0.2,
  imagery_medium: 0.1,
  imagery_low: 0.2,
  size_confirmed: 0.1,
  wage_state: 0.1,
  wage_national: 0.1,
};

export const OPTION_NOTES: Record<OptionId, string | null> = {
  lift_and_relay:
    "Reinstalls your existing tiles over new underlayment, if the tiles are in good condition. Few published prices exist, so this range is less certain.",
  concrete_tile: null,
  architectural_shingle: null,
};

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const roundDown = (x: number, step = ROUND_TO) => Math.floor(x / step + 1e-9) * step;
export const roundUp = (x: number, step = ROUND_TO) => Math.ceil(x / step - 1e-9) * step;

export function laborRatioOf(loc: LocationFactors): number {
  return clamp(loc.areaWage / loc.nationalWage, LABOR_RATIO_MIN, LABOR_RATIO_MAX);
}

export function materialRatioOf(option: OptionId, config: BuiltConfig): number {
  const family = config.options[option].ppiFamily;
  const ppi = config.ppi[family];
  if (!ppi) throw new Error(`config has no PPI series for ${family}`);
  return ppi.latestValue / ppi.baseValue;
}

/** Options shown, in order. */
export function optionsShown(state: string, currentRoof: CurrentRoof | undefined, config: BuiltConfig): OptionId[] {
  if (currentRoof === "tile" || config.tileStates.includes(state)) {
    return ["lift_and_relay", "concrete_tile", "architectural_shingle"];
  }
  return ["architectural_shingle", "concrete_tile"];
}

export function locationText(wageSource: WageSource, areaName: string): string {
  if (wageSource === "metro") return `For the ${areaName} area.`;
  if (wageSource === "state") return `For homes in ${areaName}.`;
  return "Based on national averages.";
}

export function permitFor(jobValue: number, config: BuiltConfig): number {
  const p = config.permit;
  return clamp(jobValue * p.percentOfJob, p.min, p.max);
}

interface RoofBasis {
  squares: number;
  steepSquares: number;
  waste: number;
}

interface PriceParts {
  labor: number;
  materials: number;
  otherBase: number;
  steep: number;
  permit: number;
  total: number;
}

/** Price one option at a given base per square and steep adder (low, high or midpoint). */
export function priceParts(
  option: OptionId,
  basePerSquare: number,
  steepAdder: number,
  roof: RoofBasis,
  laborRatio: number,
  config: BuiltConfig,
): PriceParts {
  const o = config.options[option];
  const wasted = roof.squares * (1 + roof.waste);
  const labor = wasted * basePerSquare * o.shares.labor * laborRatio;
  const materials = wasted * basePerSquare * o.shares.material * materialRatioOf(option, config);
  const otherBase = wasted * basePerSquare * o.shares.other;
  const steep = roof.steepSquares * steepAdder;
  const job = labor + materials + otherBase + steep;
  const permit = permitFor(job, config);
  return { labor, materials, otherBase, steep, permit, total: job + permit };
}

/** Labor and materials rounded to two decimals; other = 1 − labor − materials. */
export function sharesOf(p: PriceParts): Drivers["shares"] {
  const labor = round(p.labor / p.total, 2);
  const materials = round(p.materials / p.total, 2);
  return { labor, materials, other: round(1 - labor - materials, 2) };
}

export function confidenceOf(fallbacks: Fallback[], firstOption: OptionId): Confidence {
  if (fallbacks.length >= 2 || firstOption === "lift_and_relay") return "low";
  if (fallbacks.length === 1) return "medium";
  return "high";
}

function emptyMeasurements(source: MeasurementsOut["source"]): MeasurementsOut {
  return {
    source,
    squares: 0,
    totalAreaSqft: 0,
    segments: [],
    other: null,
    segmentCount: 0,
    maxPitch: null,
    imageryQuality: null,
    imageryDate: null,
    buildingCenter: null,
    homeSize: null,
  };
}

export function computeEstimate(
  measurements: RoofMeasurements,
  location: LocationFactors,
  config: BuiltConfig,
  inputs: EngineInputs = {},
): EngineResult {
  const configVersion = config.version;
  if (measurements.source === "unavailable") {
    return { needsFallback: true, reason: measurements.reason, measurements: null, configVersion };
  }

  const fallbacks: Fallback[] = [];
  let roof: RoofBasis;
  let out: MeasurementsOut;
  let sections: number | null;
  let complexity: RoofShape;

  if (measurements.source === "solar") {
    const solar = measureSolarRoof(measurements.segments);
    if (solar.segmentCount === 0) {
      return { needsFallback: true, reason: "no_building", measurements: null, configVersion };
    }
    out = {
      ...emptyMeasurements("solar"),
      ...solar.out,
      imageryQuality: measurements.imageryQuality,
      imageryDate: measurements.imageryDate,
      buildingCenter: measurements.buildingCenter,
    };
    // DECISION: bounds apply to the displayed squares (one decimal), so the check matches what the user sees.
    if (outOfBounds(solar.out.squares)) {
      if (!measurements.confirmedOutOfRange) {
        return { needsFallback: true, reason: "out_of_range", measurements: out, configVersion };
      }
      fallbacks.push("size_confirmed");
    }
    if (measurements.imageryQuality === "MEDIUM") fallbacks.push("imagery_medium");
    if (measurements.imageryQuality === "LOW") fallbacks.push("imagery_low");
    roof = { squares: solar.squares, steepSquares: solar.steepSquares, waste: wasteFor(solar.segmentCount) };
    sections = solar.out.segments.length;
    complexity = complexityFor(solar.segmentCount);
  } else {
    const h = measurements.homeSize;
    const squares = homeSizeSquares(h);
    fallbacks.push("home_size");
    // No pitch data in the fallback: no steep squares; the ±20% widening covers it.
    roof = { squares, steepSquares: 0, waste: WASTE_BY_SHAPE[h.shape] };
    out = { ...emptyMeasurements("home_size"), squares: round(squares, 1), totalAreaSqft: Math.round(squares * 100), homeSize: { ...h } };
    sections = null;
    complexity = h.shape;
  }

  if (location.wageSource === "state") fallbacks.push("wage_state");
  if (location.wageSource === "national") fallbacks.push("wage_national");

  const laborRatio = laborRatioOf(location);
  const widen = fallbacks.reduce((acc, f) => acc + WIDENING[f], 0);
  const shown = optionsShown(location.state, inputs.currentRoof, config);

  const options: OptionOut[] = shown.map((id) => {
    const o = config.options[id];
    const lowParts = priceParts(id, o.low, config.steepAdder.low, roof, laborRatio, config);
    const highParts = priceParts(id, o.high, config.steepAdder.high, roof, laborRatio, config);
    return {
      id,
      name: o.name,
      low: roundDown(lowParts.total * (1 - widen)),
      high: roundUp(highParts.total * (1 + widen)),
      note: OPTION_NOTES[id],
    };
  });

  const first = shown[0];
  const fo = config.options[first];
  const mid = priceParts(
    first,
    (fo.low + fo.high) / 2,
    (config.steepAdder.low + config.steepAdder.high) / 2,
    roof,
    laborRatio,
    config,
  );

  const drivers: Drivers = {
    squares: round(roof.squares, 1),
    sections,
    complexity,
    steepShare: round(roof.squares > 0 ? roof.steepSquares / roof.squares : 0, 2),
    maxPitch: out.maxPitch,
    areaName: location.areaName,
    wageSource: location.wageSource,
    laborVsNational: round(laborRatio - 1, 2),
    materialTrendSinceBase: round(materialRatioOf(first, config) - 1, 2),
    sharesOption: first,
    shares: sharesOf(mid),
    confidence: confidenceOf(fallbacks, first),
    fallbacks,
  };

  return {
    needsFallback: false,
    measurements: out,
    options,
    drivers,
    locationText: locationText(location.wageSource, location.areaName),
    configVersion,
  };
}
