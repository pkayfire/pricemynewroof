// A small synthetic config in the built-config shape, so engine tests don't move when the
// real config is rebuilt. Base costs, steep adder, permit and tile states match the spec;
// wages and ZIPs are invented.
import type { BuiltConfig } from "@/config/lib/schema";

const source = {
  name: "Synthetic source",
  url: "https://example.com/source",
  publishedLow: 1,
  publishedHigh: 2,
  pageDate: "2026-08-01",
  retrievedAt: "2026-10-03",
};

export function testConfig(over: Partial<BuiltConfig> = {}): BuiltConfig {
  return {
    schemaVersion: 1,
    version: 7,
    builtAt: "2026-10-03T00:00:00.000Z",
    checksum: `sha256:${"0".repeat(64)}`,
    productionReady: true,
    sampleInputs: [],
    overrides: { allowLargeChanges: false, largeChangeCount: 0 },
    inputs: [],
    baseDate: "2026-08",
    options: {
      architectural_shingle: {
        name: "Architectural shingle",
        low: 550,
        high: 900,
        shares: { labor: 0.55, material: 0.3, other: 0.15 },
        confidence: "medium",
        ppiFamily: "asphalt",
        sources: [source],
      },
      concrete_tile: {
        name: "New concrete tile",
        low: 1000,
        high: 1800,
        shares: { labor: 0.55, material: 0.3, other: 0.15 },
        confidence: "medium",
        ppiFamily: "concrete",
        sources: [source],
      },
      lift_and_relay: {
        name: "Tile lift and relay",
        low: 550,
        high: 900,
        shares: { labor: 0.65, material: 0.2, other: 0.15 },
        confidence: "low",
        ppiFamily: "asphalt",
        sources: [source],
      },
    },
    steepAdder: { low: 75, high: 125 },
    permit: { percentOfJob: 0.02, min: 250, max: 1500, label: "varies by city" },
    tileStates: ["AZ", "CA", "FL", "HI", "NM", "NV"],
    ppi: {
      asphalt: {
        seriesId: "WPU1361",
        title: "asphalt",
        sourceUrl: "https://example.com/ppi/asphalt",
        basePeriod: "2026-08",
        baseValue: 100,
        latestPeriod: "2026-09",
        latestValue: 103,
        ratio: 1.03,
      },
      concrete: {
        seriesId: "WPU133",
        title: "concrete",
        sourceUrl: "https://example.com/ppi/concrete",
        basePeriod: "2026-08",
        baseValue: 200,
        latestPeriod: "2026-09",
        latestValue: 200,
        ratio: 1,
      },
    },
    wages: {
      occupation: "47-2181",
      release: "May 2025",
      nationalArea: "national",
      areas: {
        national: { kind: "national", title: "U.S.", name: "U.S.", state: null, hourlyMedian: 25 },
        "msa:11111": { kind: "msa", title: "Sample Metro, AZ", name: "Sample Metro", state: "AZ", hourlyMedian: 23 },
        "msa:22222": { kind: "msa", title: "Dear Metro, CA", name: "Dear Metro", state: "CA", hourlyMedian: 50 },
        "msa:33333": { kind: "msa", title: "Cheap Metro, LA", name: "Cheap Metro", state: "LA", hourlyMedian: 10 },
        "msa:44444": { kind: "msa", title: "Even Metro, GA", name: "Even Metro", state: "GA", hourlyMedian: 25 },
        "nonmetro:3900001": {
          kind: "nonmetro",
          title: "Eastern Sample nonmetropolitan area",
          name: "Eastern Sample",
          state: "OH",
          hourlyMedian: 22,
        },
        "state:OH": { kind: "state", title: "Ohio", name: "Ohio", state: "OH", hourlyMedian: 24 },
        "state:MT": { kind: "state", title: "Montana", name: "Montana", state: "MT", hourlyMedian: 26 },
      },
    },
    hud: { year: "2026", quarter: "2" },
    hudCounty: { year: "2026", quarter: "2" },
    oewsAreaDefinitions: { release: "May 2025" },
    zips: {
      "85032": ["AZ", "11111", "msa:11111"],
      "90001": ["CA", "22222", "msa:22222"],
      "70001": ["LA", "33333", "msa:33333"],
      "30001": ["GA", "44444", "msa:44444"],
      "43006": ["OH", null, "nonmetro:3900001"],
      // In a metro whose roofer wage is suppressed → state wage.
      "44001": ["OH", "55555", "state:OH"],
      // State without a usable state wage → national.
      "05001": ["VT", null, "national"],
    },
    ...over,
  };
}
