import { describe, expect, it } from "vitest";
import { DEMO_ESTIMATES } from "../demo-fixtures";
import { createMockEstimate, getStoredEstimate, isExpired } from "../source";

describe("demo fixtures", () => {
  const priced = DEMO_ESTIMATES.filter((e) => e.measurements && e.drivers);

  it.each(priced.map((e) => [e.estimateId, e] as const))("%s is internally consistent", (_id, e) => {
    const m = e.measurements!;
    const d = e.drivers!;
    // Letters A, B, C… strictly largest first.
    m.segments.forEach((s, i) => {
      expect(s.letter).toBe(String.fromCharCode(65 + i));
      if (i > 0) expect(s.areaSqft).toBeLessThanOrEqual(m.segments[i - 1].areaSqft);
      expect(s.areaSqft).toBeGreaterThanOrEqual(50);
    });
    const sum = m.segments.reduce((a, s) => a + s.areaSqft, 0) + (m.other?.areaSqft ?? 0);
    if (m.source === "solar") {
      expect(sum).toBe(m.totalAreaSqft);
      expect(d.sections).toBe(m.segments.length);
      expect(m.segmentCount).toBe(m.segments.length + (m.other?.count ?? 0));
    }
    expect(m.squares).toBeCloseTo(m.totalAreaSqft / 100, 5);
    expect(d.squares).toBe(m.squares);
    expect(d.shares.labor + d.shares.materials + d.shares.other).toBeCloseTo(1, 9);
    expect(e.options[0].id).toBe(d.sharesOption);
    for (const o of e.options) {
      expect(o.low % 500).toBe(0);
      expect(o.high % 500).toBe(0);
      expect(o.low).toBeLessThan(o.high);
    }
  });

  it("has no real-looking address details beyond synthetic placeholders", () => {
    for (const e of DEMO_ESTIMATES) {
      if (e.formattedAddress) expect(e.formattedAddress).toMatch(/Sample|Example|Placeholder|Demo|Illustration/);
    }
  });
});

describe("mock estimate store", () => {
  it("serves demo estimates and reports expiry", async () => {
    expect(isExpired((await getStoredEstimate("demo-expired"))!)).toBe(true);
    expect(isExpired((await getStoredEstimate("demo-covered"))!, new Date("2026-10-04T00:00:00Z"))).toBe(false);
    expect(isExpired((await getStoredEstimate("demo-needs-fallback"))!)).toBe(false);
  });

  it("creates a new estimate per request, keeping the place and current roof", async () => {
    const a = await createMockEstimate({ placeId: "demo-place-covered", currentRoof: "tile" });
    expect(a?.estimateId).toMatch(/^mock-/);
    expect(a?.currentRoof).toBe("tile");
    expect(await getStoredEstimate(a!.estimateId)).toEqual(a);
    const f = await createMockEstimate({ placeId: "x", fallback: { homeSqft: 2000, stories: 2, shape: "simple" } });
    expect(f?.measurements?.homeSize).toEqual({ homeSqft: 2000, stories: 2, shape: "simple" });
    expect(await createMockEstimate({ placeId: "demo-not-found" })).toBeNull();
  });
});
