import { describe, expect, it } from "vitest";
import {
  buildConfig,
  checkPpiBase,
  checkReviewDates,
  contentChecksum,
  findLargeChanges,
  loadManual,
  loadPrevious,
  type BuildInputs,
  type BuildOptions,
} from "../build";
import { indexWages, resolveZipWage } from "../lib/wages";
import {
  wageSourceOf,
  type HudCountySource,
  type HudSource,
  type Manual,
  type OewsArea,
  type OewsAreaDefsSource,
  type OewsSource,
  type PpiSource,
} from "../lib/schema";

// ---------- helpers ----------

const area = (key: string, kind: OewsArea["kind"], state: string | null, wage: number | null, marker?: string): OewsArea => ({
  key,
  kind,
  code: key.split(":")[1] ?? "99",
  title: key,
  name: key,
  state,
  hourlyMedian: wage,
  status: wage === null ? (marker ? "suppressed" : "not_published") : "ok",
  marker: wage === null ? (marker ?? null) : null,
});

const AREAS: OewsArea[] = [
  area("national", "national", null, 25),
  area("state:AZ", "state", "AZ", 23),
  area("state:MT", "state", "MT", 24),
  area("state:WY", "state", "WY", null, "*"),
  area("state:OH", "state", "OH", 24),
  area("msa:38060", "msa", "AZ", 23.5),
  area("msa:14580", "msa", "MT", null, "*"),
  area("msa:16700", "msa", "WY", null, "#"),
  area("nonmetro:3000006", "nonmetro", "MT", 21),
  area("nonmetro:3000003", "nonmetro", "MT", 22),
  area("nonmetro:3000005", "nonmetro", "MT", null, "*"),
  area("nonmetro:3900003", "nonmetro", "OH", 22.5),
];

/** County → OEWS area (subset of the real May 2025 definitions, plus one suppressed area). */
const COUNTY_AREAS: Record<string, string> = {
  "30017": "nonmetro:3000006", // Custer County MT → East-Central Montana
  "30067": "nonmetro:3000003", // Park County MT → Southwest Montana
  "30001": "nonmetro:3000005", // Beaverhead County MT → suppressed nonmetro wage
  "30031": "msa:14580", // Gallatin County MT → Bozeman MSA
  "39111": "nonmetro:3900003", // Monroe County OH → Eastern Ohio
};

const manual = (): Manual => structuredClone(loadManual());

const hud = (value: HudSource["value"]): HudSource => ({
  input: "hud_zip_cbsa",
  sourceUrl: "https://www.huduser.gov/hudapi/public/usps?type=3&query=All",
  retrievedAt: "2026-10-03",
  sample: false,
  year: "2026",
  quarter: "2",
  value,
});

const hudCounty = (value: HudCountySource["value"]): HudCountySource => ({
  input: "hud_zip_county",
  sourceUrl: "https://www.huduser.gov/hudapi/public/usps?type=2&query=All",
  retrievedAt: "2026-10-03",
  sample: false,
  year: "2026",
  quarter: "2",
  value,
});

const areaDefs = (value: Record<string, string> = COUNTY_AREAS, release = "May 2025"): OewsAreaDefsSource => ({
  input: "oews_area_definitions",
  sourceUrl: "https://www.bls.gov/oes/area_definitions_m2025.xlsx",
  retrievedAt: "2026-10-03",
  sample: false,
  release,
  value,
});

const oews = (areas: OewsArea[] = AREAS, sample = false): OewsSource => ({
  input: "oews_47-2181",
  sourceUrl: "https://www.bls.gov/oes/special-requests/oesm25all.zip",
  retrievedAt: "2026-10-03",
  sample,
  occupation: "47-2181",
  release: "May 2025",
  value: areas,
});

const ppi = (family: "asphalt" | "concrete", seriesId: string, base: number | null, latest: number): PpiSource => ({
  input: `ppi_${family}`,
  sourceUrl: `https://data.bls.gov/timeseries/${seriesId}`,
  retrievedAt: "2026-10-03",
  sample: false,
  family,
  seriesId,
  title: seriesId,
  baseDate: "2026-08",
  base: base === null ? null : { period: "2026-08", value: base, preliminary: true },
  latest: { period: base === null ? "2026-07" : "2026-09", value: latest, preliminary: true },
  value: latest,
});

const inputs = (over: Partial<BuildInputs> = {}): BuildInputs => ({
  manual: manual(),
  hud: hud({
    "85004": ["38060", "AZ"], // metro
    "59715": ["14580", "MT"], // suppressed metro → state
    "82001": ["16700", "WY"], // suppressed metro, suppressed state → national
    "59301": ["99999", "MT"], // non-metro, county → East-Central Montana nonmetro area
    "43793": ["99999", "OH"], // non-metro, county → Eastern Ohio nonmetro area
    "59001": ["99999", "MT"], // non-metro, no county row → state
  }),
  hudCounty: hudCounty({
    "85004": ["04013", "AZ"],
    "59715": ["30031", "MT"],
    "82001": ["56021", "WY"],
    "59301": ["30017", "MT"],
    "43793": ["39111", "OH"],
  }),
  oews: oews(),
  oewsAreaDefs: areaDefs(),
  ppi: [ppi("asphalt", "WPU1361", 370, 377.4), ppi("concrete", "WPU133", 400, 404)],
  ...over,
});

const opts = (over: Partial<BuildOptions> = {}): BuildOptions => ({
  today: "2026-10-03",
  builtAt: "2026-10-03T00:00:00.000Z",
  previous: null,
  ...over,
});

// ---------- wage fallback ----------

describe("wage fallback (metro → state → national)", () => {
  const idx = indexWages(AREAS, COUNTY_AREAS);
  const geo = (cbsa: string, state: string, county: string | null = null) => ({ cbsa, state, county });

  it("uses the metro wage when published", () => {
    expect(resolveZipWage(geo("38060", "AZ", "04013"), idx)).toEqual({
      state: "AZ",
      cbsa: "38060",
      county: "04013",
      wageArea: "msa:38060",
      wageSource: "metro",
    });
  });

  it("falls back to state when the metro wage is suppressed", () => {
    expect(resolveZipWage(geo("14580", "MT", "30031"), idx)).toMatchObject({ wageArea: "state:MT", wageSource: "state" });
  });

  it("falls back to national when metro and state are suppressed", () => {
    expect(resolveZipWage(geo("16700", "WY"), idx)).toMatchObject({ wageArea: "national", wageSource: "national" });
  });

  it("falls back to state for a CBSA OEWS does not publish (micropolitan), even if its county is in a nonmetro area", () => {
    expect(resolveZipWage(geo("12345", "AZ"), idx)).toMatchObject({ wageArea: "state:AZ", wageSource: "state" });
    expect(resolveZipWage(geo("33500", "MT", "30017"), idx)).toMatchObject({ wageArea: "state:MT", wageSource: "state" });
  });

  it("maps non-CBSA ZIPs to their county's OEWS nonmetropolitan area, counted as metro", () => {
    expect(resolveZipWage(geo("99999", "MT", "30017"), idx)).toEqual({
      state: "MT",
      cbsa: null,
      county: "30017",
      wageArea: "nonmetro:3000006",
      wageSource: "metro",
    });
    // Two counties in the same state land in different nonmetro areas
    expect(resolveZipWage(geo("99999", "MT", "30067"), idx)).toMatchObject({ wageArea: "nonmetro:3000003" });
    expect(resolveZipWage(geo("99999", "OH", "39111"), idx)).toMatchObject({ wageArea: "nonmetro:3900003", wageSource: "metro" });
  });

  it("uses the state wage for unplaceable non-CBSA ZIPs", () => {
    // no county row
    expect(resolveZipWage(geo("99999", "MT", null), idx)).toMatchObject({ cbsa: null, wageArea: "state:MT", wageSource: "state" });
    // county missing from the definitions
    expect(resolveZipWage(geo("99999", "OH", "39999"), idx)).toMatchObject({ wageArea: "state:OH", wageSource: "state" });
    // nonmetro wage suppressed
    expect(resolveZipWage(geo("99999", "MT", "30001"), idx)).toMatchObject({ wageArea: "state:MT", wageSource: "state" });
    // definitions put the county in an MSA although HUD says non-CBSA: don't guess
    expect(resolveZipWage(geo("99999", "MT", "30031"), idx)).toMatchObject({ wageArea: "state:MT", wageSource: "state" });
  });

  it("falls back to national for an unplaceable ZIP in a state with no usable wage", () => {
    expect(resolveZipWage(geo("99999", "WY", "56021"), idx)).toMatchObject({ wageArea: "national", wageSource: "national" });
  });

  it("returns null when even the national wage is unusable", () => {
    const noNational = indexWages(AREAS.map((a) => (a.key === "national" ? { ...a, hourlyMedian: null, status: "suppressed" as const } : a)));
    expect(resolveZipWage(geo("16700", "WY"), noNational)).toBeNull();
  });
});

// ---------- build ----------

describe("buildConfig", () => {
  it("builds a valid first version and skips the 15% check", () => {
    const r = buildConfig(inputs(), opts());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/15% change check skipped/);
    const cfg = r.config!;
    expect(cfg.version).toBe(1);
    expect(cfg.productionReady).toBe(true);
    expect(cfg.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(cfg.ppi.asphalt.ratio).toBe(1.02);
    expect(cfg.ppi.concrete.ratio).toBe(1.01);
    expect(cfg.options.lift_and_relay).toMatchObject({ low: 550, high: 900, ppiFamily: "asphalt" });
    expect(cfg.options.concrete_tile.ppiFamily).toBe("concrete");
    expect(cfg.permit).toMatchObject({ percentOfJob: 0.02, min: 250, max: 1500 });
    expect(cfg.steepAdder).toEqual({ low: 75, high: 125 });
    expect(cfg.zips["43793"]).toEqual(["OH", null, "nonmetro:3900003"]);
    expect(cfg.zips["59301"]).toEqual(["MT", null, "nonmetro:3000006"]);
    expect(cfg.zips["59001"]).toEqual(["MT", null, "state:MT"]);
    expect(cfg.zips["82001"]).toEqual(["WY", "16700", "national"]);
    expect(r.stats.wageSources).toEqual({ metro: 3, state: 2, national: 1 });
    expect(r.stats.nonmetroZips).toBe(2);
    // wageSource is derivable from the compact ZIP row via the area's kind
    const src = (zip: string) => wageSourceOf(cfg.wages.areas[cfg.zips[zip][2]].kind);
    expect(["85004", "43793", "59301", "59715", "82001"].map(src)).toEqual(["metro", "metro", "metro", "state", "national"]);
    // Only areas used by a ZIP (plus national) are carried into the config
    expect(Object.keys(cfg.wages.areas).sort()).toEqual([
      "msa:38060",
      "national",
      "nonmetro:3000006",
      "nonmetro:3900003",
      "state:MT",
    ]);
    expect(cfg.hudCounty).toEqual({ year: "2026", quarter: "2" });
    expect(cfg.oewsAreaDefinitions).toEqual({ release: "May 2025" });
    expect(cfg.inputs.map((i) => i.input)).toEqual(expect.arrayContaining(["hud_zip_county", "oews_area_definitions"]));
  });

  it("check 1: fails when a ZIP resolves to no wage", () => {
    const areas = AREAS.map((a) => (a.key === "national" ? { ...a, hourlyMedian: null, status: "suppressed" as const, marker: "*" } : a));
    const r = buildConfig(inputs({ oews: oews(areas) }), opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/1 ZIPs do not resolve to a wage.*82001/);
  });

  it("check 2: fails on a >15% move without the override, passes with it", () => {
    const v1 = buildConfig(inputs(), opts()).config!;
    const moved = inputs();
    moved.manual.baseCosts.options.architectural_shingle.high = 1100; // +22%
    const blocked = buildConfig(moved, opts({ previous: v1 }));
    expect(blocked.ok).toBe(false);
    expect(blocked.errors.join()).toMatch(/options\.architectural_shingle\.high: 900 → 1100/);

    const allowed = buildConfig(moved, opts({ previous: v1, allowLargeChanges: true }));
    expect(allowed.ok).toBe(true);
    expect(allowed.config!.version).toBe(2);
    expect(allowed.config!.overrides).toEqual({ allowLargeChanges: true, largeChangeCount: 1 });
  });

  it("check 2: a move of exactly 15% passes", () => {
    const v1 = buildConfig(inputs(), opts()).config!;
    const moved = inputs();
    moved.manual.baseCosts.options.architectural_shingle.low = 632.5; // +15.0%
    expect(buildConfig(moved, opts({ previous: v1 })).ok).toBe(true);
  });

  it("check 2: catches a ZIP moving to a different wage area", () => {
    const v1 = buildConfig(inputs(), opts()).config!;
    // Phoenix metro wage becomes suppressed, so 85004 falls back to the AZ state wage. state:AZ
    // was not in v1 (no ZIP used it), so only the ZIP-level check sees the 23.5 → 30 move.
    const areas = AREAS.map((a) =>
      a.key === "msa:38060"
        ? { ...a, hourlyMedian: null, status: "suppressed" as const, marker: "*" }
        : a.key === "state:AZ"
          ? { ...a, hourlyMedian: 30 }
          : a,
    );
    const changes = findLargeChanges(v1, buildConfig(inputs({ oews: oews(areas) }), opts()).config!);
    expect(changes.map((c) => c.key)).toEqual(["zips.85004.wage"]);
  });

  it("check 3: fails when a manual input is past its review date", () => {
    const m = manual();
    m.permit.reviewDue = "2026-10-02";
    expect(checkReviewDates(m, "2026-10-02")).toEqual([]); // due today: still OK
    const errors = checkReviewDates(m, "2026-10-03");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/permit\.json was due for review on 2026-10-02/);
    const r = buildConfig(inputs({ manual: m }), opts());
    expect(r.ok).toBe(false);
  });

  it("committed manual inputs are due 12 months after review", () => {
    const m = manual();
    for (const f of [m.baseCosts, m.tileStates, m.permit, m.steepAdder, m.ppiSeries]) {
      const due = new Date(f.reviewedAt);
      due.setUTCFullYear(due.getUTCFullYear() + 1);
      expect(f.reviewDue).toBe(due.toISOString().slice(0, 10));
    }
    expect(checkReviewDates(m, "2027-10-04").length).toBe(5);
  });

  it("check 4: fails when a PPI base-date value is missing", () => {
    const r = buildConfig(inputs({ ppi: [ppi("asphalt", "WPU1361", null, 374), ppi("concrete", "WPU133", 400, 404)] }), opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/WPU1361 \(asphalt\) has no value for 2026-08; latest published is 2026-07/);
  });

  it("committed PPI base month is 2026-08 for both the series list and base costs", () => {
    const m = manual();
    expect(m.ppiSeries.baseDate).toBe("2026-08");
    expect(m.baseCosts.baseDate).toBe("2026-08");
    expect(m.ppiSeries.families.asphalt.seriesId).toBe("WPU1361");
    expect(m.ppiSeries.families.concrete.seriesId).toBe("WPU133");
  });

  it("check 4: fails when a used family has no fetched series or the wrong series", () => {
    expect(checkPpiBase(manual(), [ppi("asphalt", "WPU1361", 370, 371)]).join()).toMatch(/concrete .*no fetched source/);
    expect(checkPpiBase(manual(), [ppi("asphalt", "WPU136", 370, 371), ppi("concrete", "WPU133", 1, 1)]).join()).toMatch(
      /fetched series WPU136 does not match/,
    );
  });

  it("refuses sample inputs unless allowed, and marks the result not production-ready", () => {
    const sampleInputs = inputs({ oews: oews(AREAS, true) });
    const refused = buildConfig(sampleInputs, opts());
    expect(refused.ok).toBe(false);
    expect(refused.errors.join()).toMatch(/sample inputs present \(oews_47-2181\)/);

    const allowed = buildConfig(sampleInputs, opts({ allowSample: true }));
    expect(allowed.ok).toBe(true);
    expect(allowed.config!.productionReady).toBe(false);
    expect(allowed.config!.sampleInputs).toEqual(["oews_47-2181"]);
  });

  it("warns when the area definitions and wages come from different OEWS releases", () => {
    const r = buildConfig(inputs({ oewsAreaDefs: areaDefs(COUNTY_AREAS, "May 2024") }), opts());
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/area definitions \(May 2024\) and wages \(May 2025\)/);
  });

  it("treats sample county or area-definition inputs like any other sample input", () => {
    const r = buildConfig(inputs({ oewsAreaDefs: { ...areaDefs(), sample: true } }), opts());
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/sample inputs present \(oews_area_definitions\)/);
  });

  it("checksum ignores version and builtAt but changes with content", () => {
    const a = buildConfig(inputs(), opts()).config!;
    const b = buildConfig(inputs(), opts({ builtAt: "2027-01-01T00:00:00.000Z", previous: { ...a, version: 7 } })).config!;
    expect(b.version).toBe(8);
    expect(b.checksum).toBe(a.checksum);
    expect(contentChecksum({ ...a, permit: { ...a.permit, max: 1600 } })).not.toBe(a.checksum);
  });
});

// ---------- committed config ----------

describe("committed config/dist", () => {
  const cfg = loadPrevious();

  it("is production-ready, built from real inputs, with a valid checksum", () => {
    expect(cfg).not.toBeNull();
    expect(cfg!.productionReady).toBe(true);
    expect(cfg!.sampleInputs).toEqual([]);
    expect(cfg!.inputs.every((i) => !i.sample)).toBe(true);
    expect(contentChecksum(cfg!)).toBe(cfg!.checksum);
    expect(cfg!.baseDate).toBe("2026-08");
  });

  it("resolves every ZIP to a wage area carried in the file", () => {
    for (const [, , area] of Object.values(cfg!.zips)) expect(cfg!.wages.areas[area]).toBeDefined();
  });
});
