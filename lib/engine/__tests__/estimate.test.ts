import { describe, expect, it } from "vitest";
import {
  compassOf,
  computeEstimate,
  confidenceOf,
  homeSizeSquares,
  isSteep,
  laborRatioOf,
  letterFor,
  locationText,
  measureSolarRoof,
  optionsShown,
  permitFor,
  pitchLabel,
  resolveLocationFactors,
  roundDown,
  roundUp,
  wasteFor,
  type EngineResult,
  type EstimateResult,
  type RawSegment,
  type RoofMeasurements,
  imageryAgeYears,
} from "@/lib/engine";
import { parseBuildingInsights } from "@/lib/google/solar";
import { solarFixture } from "@/test/fixtures";
import { testConfig } from "@/test/fixtures/config";

const config = testConfig();
const loc = (zip: string, state = "ZZ") => resolveLocationFactors(zip, state, config);
const solar = (name: string) => parseBuildingInsights(solarFixture(name));

function ok(r: EngineResult): EstimateResult {
  if (r.needsFallback) throw new Error(`expected an estimate, got needsFallback (${r.reason})`);
  return r;
}

/** Degrees for a rise of x/12. */
const deg = (rise: number) => (Math.atan(rise / 12) * 180) / Math.PI;
/** m² for a given sq ft. */
const m2 = (sqft: number) => sqft / 10.764;
const seg = (sqft: number, rise = 5, azimuth = 180): RawSegment => ({
  areaM2: m2(sqft),
  pitchDegrees: deg(rise),
  azimuthDegrees: azimuth,
  center: { latitude: 10, longitude: -30 },
});
const solarOf = (segments: RawSegment[], imageryQuality: "HIGH" | "MEDIUM" | "LOW" = "HIGH"): RoofMeasurements => ({
  source: "solar",
  segments,
  imageryQuality,
  imageryDate: "2025-04-12",
  buildingCenter: null,
});

describe("measurement math", () => {
  it("converts m² to squares and pitch degrees to x/12", () => {
    const r = measureSolarRoof([seg(1000), seg(1000)]);
    expect(r.squares).toBeCloseTo(20, 6);
    expect(pitchLabel(deg(8))).toBe("8/12");
    expect(pitchLabel(26.5651)).toBe("6/12");
    expect(pitchLabel(0)).toBe("0/12");
  });

  it("uses waste tiers 10% / 12% / 15%", () => {
    expect([1, 4, 5, 10, 11, 30].map(wasteFor)).toEqual([0.1, 0.1, 0.12, 0.12, 0.15, 0.15]);
  });

  it("counts squares steeper than 6/12 as steep", () => {
    expect(isSteep(deg(6))).toBe(false);
    expect(isSteep(deg(7))).toBe(true);
    const r = measureSolarRoof([seg(1000, 8), seg(1000, 6), seg(500, 12)]);
    expect(r.steepSquares).toBeCloseTo(15, 6);
  });

  it("maps azimuth to the nearest of 8 compass points", () => {
    expect([0, 22, 23, 90, 135, 180, 225, 270, 315, 337, 338, 360, -45].map(compassOf)).toEqual([
      "N", "N", "NE", "E", "SE", "S", "SW", "W", "NW", "NW", "N", "N", "NW",
    ]);
  });

  it("letters planes A…Z then AA", () => {
    expect([0, 1, 25, 26, 27].map(letterFor)).toEqual(["A", "B", "Z", "AA", "AB"]);
  });

  it("letters planes ≥ 50 sq ft by area, largest first, and groups smaller ones as Other", () => {
    const r = measureSolarRoof([seg(300, 4, 90), seg(49.9), seg(800, 7, 0), seg(50), seg(20), seg(500, 5, 270)]);
    expect(r.out.segments.map((s) => [s.letter, s.areaSqft])).toEqual([
      ["A", 800],
      ["B", 500],
      ["C", 300],
      ["D", 50],
    ]);
    expect(r.out.segments[0]).toMatchObject({ pitch: "7/12", compass: "N", azimuth: 0 });
    expect(r.out.segments[1].compass).toBe("W");
    expect(r.out.other).toEqual({ count: 2, areaSqft: 70 });
    // Waste and segment count still include the small planes.
    expect(r.segmentCount).toBe(6);
    expect(r.out.totalAreaSqft).toBe(1720);
  });

  it("keeps the API order for planes of equal area", () => {
    const a = { ...seg(400), azimuthDegrees: 90 };
    const b = { ...seg(400), azimuthDegrees: 270 };
    const r = measureSolarRoof([a, b]);
    expect(r.out.segments.map((s) => s.compass)).toEqual(["E", "W"]);
  });

  it("computes home-size squares with shape factors", () => {
    expect(homeSizeSquares({ homeSqft: 2000, stories: 1, shape: "simple" })).toBeCloseTo(23, 6);
    expect(homeSizeSquares({ homeSqft: 2000, stories: 1, shape: "average" })).toBeCloseTo(25.3, 6);
    expect(homeSizeSquares({ homeSqft: 2000, stories: 2, shape: "complex" })).toBeCloseTo(14.375, 6);
  });
});

describe("location factors", () => {
  it("uses the metro wage for a metro ZIP", () => {
    const l = loc("85032");
    expect(l).toMatchObject({ state: "AZ", cbsa: "11111", wageSource: "metro", areaName: "Sample Metro" });
    expect(laborRatioOf(l)).toBeCloseTo(0.92, 9);
  });

  it("uses the nonmetro area's own wage for a non-metro ZIP (counts as metro)", () => {
    const l = loc("43006");
    expect(l).toMatchObject({ cbsa: null, wageSource: "metro", areaKind: "nonmetro", areaName: "Eastern Sample" });
    expect(locationText(l.wageSource, l.areaName)).toBe("For the Eastern Sample area.");
  });

  it("falls back to the state wage when the metro wage is suppressed", () => {
    const l = loc("44001");
    expect(l).toMatchObject({ wageSource: "state", areaName: "Ohio", areaWage: 24 });
    expect(locationText(l.wageSource, l.areaName)).toBe("For homes in Ohio.");
  });

  it("falls back to national when the state has no wage", () => {
    const l = loc("05001");
    expect(l.wageSource).toBe("national");
    expect(locationText(l.wageSource, l.areaName)).toBe("Based on national averages.");
  });

  it("uses the address state for a ZIP missing from the config", () => {
    expect(loc("59999", "mt")).toMatchObject({ state: "MT", wageSource: "state", areaName: "Montana", cbsa: null });
    expect(loc("99999", "WY")).toMatchObject({ state: "WY", wageSource: "national" });
  });

  it("clamps the labor ratio to [0.75, 1.6]", () => {
    expect(laborRatioOf(loc("90001"))).toBe(1.6); // 50 / 25 = 2.0
    expect(laborRatioOf(loc("70001"))).toBe(0.75); // 10 / 25 = 0.4
  });
});

describe("options shown", () => {
  it("shows lift and relay, new tile, shingle in a tile state", () => {
    expect(optionsShown("AZ", undefined, config)).toEqual(["lift_and_relay", "concrete_tile", "architectural_shingle"]);
    expect(optionsShown("TX", "shingle", config)).toEqual(["architectural_shingle", "concrete_tile"]);
    expect(optionsShown("TX", "tile", config)).toEqual(["lift_and_relay", "concrete_tile", "architectural_shingle"]);
  });

  it("shows the tile options first when the current roof is tile, anywhere", () => {
    expect(optionsShown("GA", "tile", config)).toEqual(["lift_and_relay", "concrete_tile", "architectural_shingle"]);
  });

  it("shows shingle then tile elsewhere", () => {
    expect(optionsShown("GA", undefined, config)).toEqual(["architectural_shingle", "concrete_tile"]);
    expect(optionsShown("OH", "shingle", config)).toEqual(["architectural_shingle", "concrete_tile"]);
  });
});

describe("rounding and permit", () => {
  it("rounds low down and high up to $500", () => {
    expect(roundDown(12999.99)).toBe(12500);
    expect(roundDown(13000)).toBe(13000);
    expect(roundUp(12500.01)).toBe(13000);
    expect(roundUp(13000)).toBe(13000);
  });

  it("charges 2% of job value within min and max", () => {
    expect(permitFor(5000, config)).toBe(250);
    expect(permitFor(20000, config)).toBe(400);
    expect(permitFor(200000, config)).toBe(1500);
  });
});

describe("computeEstimate", () => {
  it("prices a simple roof (hand-computed)", () => {
    // 189.5 m² → 20.398 squares; 4 planes → 10% waste; no steep planes; Even Metro wage = national.
    const r = ok(computeEstimate(solar("simple"), loc("30001"), config));
    expect(r.measurements).toMatchObject({ squares: 20.4, segmentCount: 4, maxPitch: "5/12", imageryQuality: "HIGH" });
    expect(r.measurements.segments.map((s) => s.letter)).toEqual(["A", "B", "C", "D"]);
    // Shingle low: 22.4376 × 550 × (0.55 + 0.30 × 1.03 + 0.15) = 12,451.7; permit min 250 → 12,701.7 → 12,500.
    // Shingle high: 22.4376 × 900 × 1.009 = 20,375.6; permit 407.5 → 20,783.1 → 21,000.
    expect(r.options.map((o) => [o.id, o.low, o.high])).toEqual([
      ["architectural_shingle", 12500, 21000],
      // Tile low: 22.4376 × 1000 × 1.0 = 22,437.6 + 448.8 = 22,886.4 → 22,500; high ×1.8 = 40,387.7 + 807.8 → 41,500.
      ["concrete_tile", 22500, 41500],
    ]);
    expect(r.drivers).toMatchObject({
      squares: 20.4,
      sections: 4,
      complexity: "simple",
      steepShare: 0,
      maxPitch: "5/12",
      areaName: "Even Metro",
      wageSource: "metro",
      laborVsNational: 0,
      materialTrendSinceBase: 0.03,
      sharesOption: "architectural_shingle",
      confidence: "high",
      fallbacks: [],
    });
    expect(r.locationText).toBe("For the Even Metro area.");
    expect(r.configVersion).toBe(7);
  });

  it("reproduces the spec's worked shares example (0.59 / 0.20 / 0.21)", () => {
    // 20.4 squares, 9 planes (12% waste), 30% steep at 8/12, Arizona metro wage 0.92 of national, PPI +3%.
    const r = ok(computeEstimate(solar("worked-example"), loc("85032"), config));
    expect(r.drivers).toMatchObject({
      squares: 20.4,
      sections: 9,
      complexity: "average",
      steepShare: 0.3,
      maxPitch: "8/12",
      areaName: "Sample Metro",
      wageSource: "metro",
      laborVsNational: -0.08,
      materialTrendSinceBase: 0.03,
      sharesOption: "lift_and_relay",
      shares: { labor: 0.59, materials: 0.2, other: 0.21 },
      // Lift and relay is shown first → low confidence.
      confidence: "low",
      fallbacks: [],
    });
    expect(r.options.map((o) => o.id)).toEqual(["lift_and_relay", "concrete_tile", "architectural_shingle"]);
    expect(r.options[0].note).toMatch(/less certain/);
  });

  it("prices a complex roof (> 10 planes) with 15% waste", () => {
    const r = ok(computeEstimate(solar("complex"), loc("30001"), config));
    expect(r.measurements.segmentCount).toBe(14);
    expect(r.drivers.complexity).toBe("complex");
    // Planes under 50 sq ft are grouped and not counted as sections.
    expect(r.drivers.sections).toBe(11);
    expect(r.measurements.other?.count).toBe(3);
    expect(r.drivers.maxPitch).toBe("12/12");
    // The 0° plane (pitchDegrees omitted by proto3 JSON) is in Other, so every lettered plane has a compass.
    expect(r.measurements.segments.every((s) => s.compass !== null)).toBe(true);
    const simple = ok(computeEstimate(solarOf([seg(30.2 * 100)]), loc("30001"), config));
    // Per square before permit is higher on the complex roof (more waste).
    const perSq = (e: EstimateResult) => e.options[0].low / e.drivers.squares;
    expect(perSq(r)).toBeGreaterThan(perSq(simple));
  });

  it("prices a steep roof with the steep adder", () => {
    const r = ok(computeEstimate(solar("steep"), loc("30001"), config));
    expect(r.drivers.maxPitch).toBe("12/12");
    // Steep planes: 2 × 65.03 + 2 × 27.87 m² of 213.7 m².
    expect(r.drivers.steepShare).toBeCloseTo(0.87, 2);
    const flatter = ok(
      computeEstimate(
        {
          ...solar("steep"),
          segments: solar("steep").segments.map((s) => ({ ...s, pitchDegrees: deg(5) })),
        },
        loc("30001"),
        config,
      ),
    );
    // Steep squares × $75 low / $125 high (+ permit on it).
    const steepSq = (2 * 65.0316 + 2 * 27.8707) * 0.10764;
    expect(r.options[0].low - flatter.options[0].low).toBeGreaterThanOrEqual(roundDown(steepSq * 75 * 1.02) - 500);
    expect(r.options[0].high).toBeGreaterThan(flatter.options[0].high);
  });

  it("asks for home size when there is no Solar coverage", () => {
    const r = computeEstimate({ source: "unavailable", reason: "no_building" }, loc("30001"), config);
    expect(r).toEqual({ needsFallback: true, reason: "no_building", measurements: null, configVersion: 7 });
    const empty = computeEstimate(solarOf([]), loc("30001"), config);
    expect(empty).toMatchObject({ needsFallback: true, reason: "no_building" });
  });

  it("prices the home-size fallback and widens it ±20%", () => {
    const h = { homeSqft: 2000, stories: 1, shape: "average" as const };
    const r = ok(computeEstimate({ source: "home_size", homeSize: h }, loc("30001"), config));
    expect(r.measurements).toMatchObject({ source: "home_size", squares: 25.3, segments: [], homeSize: h });
    expect(r.drivers).toMatchObject({
      squares: 25.3,
      sections: null,
      complexity: "average",
      steepShare: 0,
      maxPitch: null,
      fallbacks: ["home_size"],
      confidence: "medium",
    });
    // 25.3 × 1.12 × 550 × 1.009 = 15,725.0 + 314.5 permit = 16,039.5; × 0.8 = 12,831.6 → 12,500.
    // 25.3 × 1.12 × 900 × 1.009 = 25,731.8 + 514.6 = 26,246.5; × 1.2 = 31,495.8 → 31,500.
    expect([r.options[0].low, r.options[0].high]).toEqual([12500, 31500]);
  });

  it("widens by imagery quality: HIGH none, MEDIUM ±10%, LOW ±20%", () => {
    const high = ok(computeEstimate(solar("simple"), loc("30001"), config));
    const med = ok(computeEstimate(solar("simple-medium"), loc("30001"), config));
    const low = ok(computeEstimate(solar("simple-low"), loc("30001"), config));
    // Unrounded shingle totals from the simple-roof test: 12,701.7 and 20,783.1.
    expect([med.options[0].low, med.options[0].high]).toEqual([roundDown(12701.75 * 0.9), roundUp(20783.1 * 1.1)]);
    expect([low.options[0].low, low.options[0].high]).toEqual([roundDown(12701.75 * 0.8), roundUp(20783.1 * 1.2)]);
    expect(high.drivers.confidence).toBe("high");
    expect(med.drivers).toMatchObject({ confidence: "medium", fallbacks: ["imagery_medium"] });
    expect(low.drivers).toMatchObject({ confidence: "medium", fallbacks: ["imagery_low"] });
    expect(low.measurements.imageryQuality).toBe("LOW");
    // Shares are computed before widening, so they don't change.
    expect(low.drivers.shares).toEqual(high.drivers.shares);
  });

  it("lowers confidence and widens for wage fallbacks", () => {
    const state = ok(computeEstimate(solar("simple"), loc("44001"), config));
    expect(state.drivers).toMatchObject({ wageSource: "state", fallbacks: ["wage_state"], confidence: "medium" });
    expect(state.locationText).toBe("For homes in Ohio.");
    const two = ok(computeEstimate(solar("simple-medium"), loc("05001"), config));
    expect(two.drivers).toMatchObject({ fallbacks: ["imagery_medium", "wage_national"], confidence: "low" });
    expect(two.locationText).toBe("Based on national averages.");
  });

  it("reports laborVsNational after the clamp", () => {
    expect(ok(computeEstimate(solar("simple"), loc("90001"), config)).drivers.laborVsNational).toBe(0.6);
    expect(ok(computeEstimate(solar("simple"), loc("70001"), config)).drivers.laborVsNational).toBe(-0.25);
  });

  it("treats < 8 or > 60 squares as the wrong building unless confirmed", () => {
    const small = computeEstimate(solar("too-small"), loc("30001"), config);
    expect(small).toMatchObject({ needsFallback: true, reason: "out_of_range" });
    expect(small.measurements?.squares).toBe(5.8);
    const large = computeEstimate(solar("too-large"), loc("30001"), config);
    expect(large).toMatchObject({ needsFallback: true, reason: "out_of_range" });
    expect(large.measurements?.squares).toBe(69);
    const confirmed = ok(computeEstimate({ ...solar("too-large"), confirmedBuilding: true }, loc("30001"), config));
    expect(confirmed.drivers).toMatchObject({ squares: 69, fallbacks: ["size_confirmed"], confidence: "medium" });
    // Bounds are exclusive: exactly 8 and 60 squares are fine.
    expect(computeEstimate(solarOf([seg(800)]), loc("30001"), config).needsFallback).toBe(false);
    expect(computeEstimate(solarOf([seg(6000)]), loc("30001"), config).needsFallback).toBe(false);
  });

  it("treats a building more than 40 m from the address as the wrong building unless confirmed", () => {
    const m = solar("simple"); // building center 10, -30
    const near = { latitude: 10.0002, longitude: -30 }; // ~22 m
    const far = { latitude: 10.0005, longitude: -30 }; // ~56 m
    expect(computeEstimate(m, loc("30001"), config, { addressLocation: near }).needsFallback).toBe(false);
    const r = computeEstimate(m, loc("30001"), config, { addressLocation: far });
    expect(r).toMatchObject({ needsFallback: true, reason: "far_building" });
    expect(r.measurements?.squares).toBeGreaterThan(0);
    const confirmed = ok(computeEstimate({ ...m, confirmedBuilding: true }, loc("30001"), config, { addressLocation: far }));
    expect(confirmed.drivers).toMatchObject({ fallbacks: ["building_confirmed"], confidence: "medium" });
    // No address point: no distance check.
    expect(computeEstimate(m, loc("30001"), config).needsFallback).toBe(false);
  });

  it("lowers confidence one level for imagery 5+ years old, without widening", () => {
    const fresh = ok(computeEstimate(solar("simple"), loc("30001"), config, { asOf: "2026-10-03" }));
    const m = { ...solar("simple"), imageryDate: "2013-06-01" };
    const old = ok(computeEstimate(m, loc("30001"), config, { asOf: "2026-10-03" }));
    expect(fresh.drivers.confidence).toBe("high");
    expect(old.drivers).toMatchObject({ fallbacks: ["imagery_old"], confidence: "medium" });
    expect(old.options).toEqual(fresh.options);
    // Exactly 5 years counts as old; one day short doesn't.
    expect(imageryAgeYears("2021-10-03", "2026-10-03")).toBe(5);
    expect(imageryAgeYears("2021-10-04", "2026-10-03")).toBe(4);
    expect(imageryAgeYears("2021-10", "2026-10-03")).toBe(5);
    // Without asOf the age check is skipped.
    expect(ok(computeEstimate(m, loc("30001"), config)).drivers.fallbacks).toEqual([]);
  });

  it("follows the current roof for options and shares", () => {
    const tile = ok(computeEstimate(solar("simple"), loc("30001"), config, { currentRoof: "tile" }));
    expect(tile.options.map((o) => o.id)).toEqual(["lift_and_relay", "concrete_tile", "architectural_shingle"]);
    expect(tile.drivers.sharesOption).toBe("lift_and_relay");
    expect(tile.drivers.confidence).toBe("low");
  });

  it("returns shares that always sum to 1", () => {
    const zips = ["85032", "90001", "70001", "30001", "43006", "44001", "05001"];
    const fixtures = ["simple", "simple-low", "complex", "steep", "worked-example"];
    for (const zip of zips) {
      for (const f of fixtures) {
        for (const currentRoof of [undefined, "tile" as const]) {
          const { shares } = ok(computeEstimate(solar(f), loc(zip), config, { currentRoof })).drivers;
          expect(shares.labor + shares.materials + shares.other).toBeCloseTo(1, 10);
          expect(Math.min(shares.labor, shares.materials, shares.other)).toBeGreaterThan(0);
          expect(Number.isInteger(Math.round(shares.other * 100))).toBe(true);
        }
      }
    }
  });

  it("returns whole-dollar prices on $500 steps with low < high", () => {
    for (const f of ["simple", "simple-medium", "complex", "steep", "worked-example"]) {
      for (const o of ok(computeEstimate(solar(f), loc("85032"), config)).options) {
        expect(o.low % 500).toBe(0);
        expect(o.high % 500).toBe(0);
        expect(o.low).toBeLessThan(o.high);
      }
    }
  });

  it("is deterministic and doesn't mutate its inputs", () => {
    const m = solar("complex");
    const l = loc("85032");
    const before = JSON.stringify([m, l, config]);
    const a = computeEstimate(m, l, config, { currentRoof: "shingle" });
    const b = computeEstimate(structuredClone(m), structuredClone(l), structuredClone(config), { currentRoof: "shingle" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify([m, l, config])).toBe(before);
  });
});

describe("confidence", () => {
  it("is high with no fallbacks, medium with one, low with two or lift and relay first", () => {
    expect(confidenceOf([], "architectural_shingle")).toBe("high");
    expect(confidenceOf(["imagery_medium"], "architectural_shingle")).toBe("medium");
    expect(confidenceOf(["imagery_low", "wage_state"], "architectural_shingle")).toBe("low");
    expect(confidenceOf([], "lift_and_relay")).toBe("low");
  });
});
