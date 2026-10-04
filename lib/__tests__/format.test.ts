import { describe, expect, it } from "vitest";
import {
  compassFromAzimuth,
  formatImageryDate,
  formatRange,
  CURRENT_ROOF_LABELS,
  compassName,
  locationText,
  lowConfidenceNote,
  oldImageryNote,
  wideningNote,
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

  it("explains widened ranges from the engine's widening table", () => {
    expect(wideningNote(["imagery_medium"])).toBe(
      "Each range is 10% wider because the satellite imagery for this roof is medium resolution.",
    );
    expect(wideningNote(["imagery_low", "wage_state"])).toMatch(/^Each range is 30% wider because .* low resolution, and local roofer wages/);
    expect(wideningNote(["building_confirmed"])).toContain("10% wider because you confirmed a building set back");
    expect(wideningNote([])).toBeNull();
    // Old imagery lowers confidence but never widens.
    expect(wideningNote(["imagery_old"])).toBeNull();
  });

  it("notes old imagery with its year", () => {
    expect(oldImageryNote(["imagery_old"], "2019-05-10")).toBe(
      "Satellite imagery for this home is from 2019; recent changes may not show.",
    );
    expect(oldImageryNote([], "2019-05-10")).toBeNull();
  });

  it("adds a low-confidence note only for low confidence", () => {
    expect(lowConfidenceNote({ confidence: "medium", fallbacks: ["imagery_medium"], sharesOption: "architectural_shingle" })).toBeNull();
    expect(lowConfidenceNote({ confidence: "low", fallbacks: [], sharesOption: "lift_and_relay" })).toBe(
      "Treat these ranges as a rough guide until a roofer sees the roof.",
    );
  });

  it("labels the current-roof choices and compass points", () => {
    expect(CURRENT_ROOF_LABELS).toEqual({ shingle: "Asphalt shingle", tile: "Tile", metal: "Metal", not_sure: "Not sure" });
    expect(compassName("NE", 45)).toBe("Northeast");
    expect(compassName(null, 0)).toBe("Flat");
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
