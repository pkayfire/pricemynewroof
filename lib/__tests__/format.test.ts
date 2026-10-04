import { describe, expect, it } from "vitest";
import {
  compassFromAzimuth,
  formatImageryDate,
  formatRange,
  imageryNote,
  locationText,
  lowConfidenceNote,
  sheetSubtitle,
  sourcesSentence,
} from "../format";
import { referralDisclosure, referralSentence } from "../site/copy";

describe("format helpers", () => {
  it("formats price ranges with an en dash", () => {
    expect(formatRange(12500, 21500)).toBe("$12,500–$21,500");
  });

  it("formats imagery dates", () => {
    expect(formatImageryDate("2025-06-14")).toBe("June 14, 2025");
    expect(formatImageryDate("2024-09")).toBe("September 2024");
    expect(formatImageryDate(null)).toBeNull();
  });

  it("maps azimuth to the nearest of 8 compass directions", () => {
    expect([0, 22, 23, 90, 180, 200, 270, 338, 359, -45].map(compassFromAzimuth)).toEqual([
      "North", "North", "Northeast", "East", "South", "South", "West", "North", "North", "Northwest",
    ]);
  });

  it("words the area per wageSource (Build decisions)", () => {
    expect(locationText("Los Angeles-Long Beach-Anaheim", "metro")).toBe("For the Los Angeles-Long Beach-Anaheim area.");
    expect(locationText("Montana", "state")).toBe("For homes in Montana.");
    expect(locationText("U.S.", "national")).toBe("Based on national averages.");
    expect(sheetSubtitle({ areaName: "Eastern Montana", wageSource: "metro" })).toBe(
      "For the Eastern Montana area. A general estimate, not a quote.",
    );
  });

  it("always includes the satellite limitation in the sources line", () => {
    expect(sourcesSentence({ wageSource: "metro" }, { source: "solar" })).toContain(
      "Satellite data can't show underlayment or damaged decking.",
    );
    expect(sourcesSentence({ wageSource: "state" }, { source: "home_size" })).toContain("BLS wage data for your state");
  });

  it("explains widened ranges and low confidence", () => {
    expect(imageryNote(["imagery_medium"])).toContain("10%");
    expect(imageryNote(["imagery_low", "wage_state"])).toContain("20%");
    expect(imageryNote([])).toBeNull();
    expect(lowConfidenceNote({ confidence: "medium", fallbacks: ["imagery_medium"], sharesOption: "architectural_shingle" })).toBeNull();
    expect(
      lowConfidenceNote({ confidence: "low", fallbacks: ["imagery_low", "wage_state"], sharesOption: "architectural_shingle" }),
    ).toMatch(/^The satellite imagery .* low resolution; local roofer wages .*\. Treat these ranges/);
    expect(lowConfidenceNote({ confidence: "low", fallbacks: [], sharesOption: "lift_and_relay" })).toContain(
      "Tile lift and relay has the least published cost data",
    );
  });
});

describe("referral copy", () => {
  it("uses the manual-mode sentence and mentions payment only once a buyer is confirmed", () => {
    expect(referralSentence("manual", false)).toBe("We'll pass your request to a local roofer within one business day.");
    expect(referralSentence("manual", true)).toContain("They pay us for the referral.");
    expect(referralDisclosure("manual", false)).not.toMatch(/pay/);
    expect(referralDisclosure("manual", false)).toContain("not a roofing contractor");
  });
});
