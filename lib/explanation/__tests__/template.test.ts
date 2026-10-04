import { describe, expect, it } from "vitest";
import { templateExplanation } from "../template";
import { validateExplanation } from "../validator";
import { FLAT_METRO_DRIVERS, NATIONAL_HOME_SIZE_DRIVERS, SPEC_DRIVERS, STATE_DRIVERS } from "./fixtures";

describe("templateExplanation", () => {
  it("follows the spec's template for a metro estimate", () => {
    expect(templateExplanation(SPEC_DRIVERS)).toBe(
      "Your roof is about 20.4 squares across 9 sections. About 30% of it is steep, up to 8/12, which takes extra time and safety work. Roofing labor in the Phoenix area runs about 8% below the national average.",
    );
  });

  it("says plainly when the state or national wage is used", () => {
    expect(templateExplanation(STATE_DRIVERS)).toContain(
      "Local wage data isn't published for your area, so labor uses the Montana state figure, about 6% above the national average.",
    );
    expect(templateExplanation(NATIONAL_HOME_SIZE_DRIVERS)).toBe(
      "Your roof is about 22.8 squares, estimated from your home's size. Without satellite measurements the range is wider. Local wage data isn't available for your area, so labor is priced at the national average.",
    );
  });

  it("handles a roof with no steep planes and labor above average", () => {
    expect(templateExplanation(FLAT_METRO_DRIVERS)).toBe(
      "Your roof is about 20.4 squares across 9 sections. None of it is steep, so it's quicker to work on safely. Roofing labor in the Los Angeles-Long Beach-Anaheim area runs about 27% above the national average.",
    );
  });

  it.each([
    ["metro", SPEC_DRIVERS],
    ["state", STATE_DRIVERS],
    ["national home size", NATIONAL_HOME_SIZE_DRIVERS],
    ["flat metro", FLAT_METRO_DRIVERS],
    ["labor at national", { ...SPEC_DRIVERS, laborVsNational: 0.004 }],
    ["one section", { ...SPEC_DRIVERS, sections: 1 }],
  ])("passes the validator itself (%s)", (_name, drivers) => {
    const text = templateExplanation(drivers);
    expect(validateExplanation(text, drivers)).toEqual({ ok: true, failures: [] });
  });
});
