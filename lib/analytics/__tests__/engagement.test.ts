import { describe, expect, it } from "vitest";
import { newMilestones, scrollPercent } from "@/lib/analytics/engagement";

describe("estimate engagement", () => {
  it("measures the share of the page seen, clamped to 0–100", () => {
    expect(scrollPercent(0, 800, 3200)).toBe(25);
    expect(scrollPercent(2400, 800, 3200)).toBe(100);
    expect(scrollPercent(5000, 800, 3200)).toBe(100);
    expect(scrollPercent(0, 800, 0)).toBe(100);
  });

  it("reports each milestone once, in order, and treats 98% as the bottom", () => {
    expect(newMilestones(0, 20)).toEqual([]);
    expect(newMilestones(0, 60)).toEqual([25, 50]);
    expect(newMilestones(50, 60)).toEqual([]);
    expect(newMilestones(50, 98)).toEqual([75, 100]);
    expect(newMilestones(100, 100)).toEqual([]);
  });
});
