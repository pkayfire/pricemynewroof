import { describe, expect, it } from "vitest";
import { demoEstimateRecords, demoEstimateViews } from "../demo-fixtures";
import { demoEstimatesEnabled, getEstimateView, type EstimateSourceDeps } from "../source";
import { MemoryEstimateStore } from "../store";
import { displayMeasurements, isExpired, toEstimateView } from "../view";

const NOW = new Date("2026-10-03T18:00:00Z");

describe("demo estimates (engine-computed)", () => {
  const records = demoEstimateRecords(NOW);
  const byId = new Map(records.map((r) => [r.id, r]));

  it("cover every page state", () => {
    expect(byId.get("demo-covered")).toMatchObject({ needsFallback: false, drivers: { confidence: "high", fallbacks: [] } });
    expect(byId.get("demo-no-coverage")?.options?.[0].id).toBe("lift_and_relay");
    expect(byId.get("demo-medium-imagery")?.drivers?.fallbacks).toEqual(["imagery_medium"]);
    expect(byId.get("demo-low-confidence")?.drivers).toMatchObject({ wageSource: "state", areaName: "Montana", confidence: "low" });
    expect(byId.get("demo-old-imagery")?.drivers?.fallbacks).toEqual(["imagery_old"]);
    expect(byId.get("demo-out-of-range")).toMatchObject({ needsFallback: true, fallbackReason: "out_of_range" });
    expect(byId.get("demo-far-building")).toMatchObject({ needsFallback: true, fallbackReason: "far_building" });
    expect(byId.get("demo-building-confirmed")?.drivers?.fallbacks).toContain("building_confirmed");
    expect(byId.get("demo-home-size")?.drivers?.fallbacks).toContain("home_size");
    expect(byId.get("demo-needs-fallback")).toMatchObject({ needsFallback: true, fallbackReason: "no_building" });
    expect(byId.get("demo-expired")?.measurements).toBeNull();
  });

  it("letter planes strictly largest first and keep only synthetic addresses", () => {
    for (const r of records) {
      const m = displayMeasurements(r.measurements);
      m?.segments.forEach((s, i) => {
        expect(s.letter).toBe(String.fromCharCode(65 + i));
        if (i > 0) expect(s.areaSqft).toBeLessThanOrEqual(m.segments[i - 1].areaSqft);
      });
      if (r.formattedAddress) expect(r.formattedAddress).toMatch(/Sample|Example|Placeholder|Demo|Illustration/);
    }
  });

  it("shows the measured roof for wrong-building checks and expires purged estimates", async () => {
    const views = await demoEstimateViews(NOW);
    expect(views.get("demo-far-building")?.measurements?.segments.length).toBe(6);
    expect(isExpired(views.get("demo-far-building")!, NOW)).toBe(false);
    expect(isExpired(views.get("demo-expired")!, NOW)).toBe(true);
    expect(isExpired(views.get("demo-needs-fallback")!, NOW)).toBe(false);
    expect(isExpired(views.get("demo-covered")!, NOW)).toBe(false);
  });
});

describe("getEstimateView", () => {
  const deps = (store: MemoryEstimateStore, demos = false): EstimateSourceDeps => ({
    store: () => store,
    coverage: { forZip: async () => ({ covered: true, leadTypes: [] }) },
    demos: () => (demos ? demoEstimateViews(NOW) : null),
  });

  it("reads Milestone 2's store and adds coverage", async () => {
    const store = new MemoryEstimateStore();
    const rec = { ...demoEstimateRecords(NOW)[0], id: "6f1c1c1e-1d6b-4c3e-9b8a-2b1d3c4e5f60" };
    await store.insert(rec);
    const view = await getEstimateView(rec.id, deps(store));
    expect(view).toEqual(toEstimateView(rec, { covered: true, leadTypes: [] }));
  });

  it("never queries the store with a non-UUID id", async () => {
    const store = new MemoryEstimateStore();
    expect(await getEstimateView("not-a-uuid", deps(store))).toBeNull();
  });

  it("serves demos only when enabled, and never in production", async () => {
    const store = new MemoryEstimateStore();
    expect(await getEstimateView("demo-covered", deps(store, false))).toBeNull();
    expect((await getEstimateView("demo-covered", deps(store, true)))?.estimateId).toBe("demo-covered");
    expect(demoEstimatesEnabled({ NODE_ENV: "production", DEMO_ESTIMATES: "1" } as NodeJS.ProcessEnv)).toBe(false);
    expect(demoEstimatesEnabled({ NODE_ENV: "development", DEMO_ESTIMATES: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(demoEstimatesEnabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
  });
});
