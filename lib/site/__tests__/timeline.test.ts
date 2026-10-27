import { describe, expect, it } from "vitest";
import { callFirst, isTimelineAnswer, TIMELINE_ANSWERS } from "@/lib/site/timeline";

describe("replacement timeline question", () => {
  it("offers three answers in order", () => {
    expect(TIMELINE_ANSWERS.map((a) => a.label)).toEqual(["Within 3 months", "This year", "Just researching"]);
  });

  it("leads with the call until the visitor says they're replacing later", () => {
    expect(callFirst(null)).toBe(true);
    expect(callFirst("3_months")).toBe(true);
    expect(callFirst("this_year")).toBe(false);
    expect(callFirst("researching")).toBe(false);
  });

  it("recognizes only known answers", () => {
    expect(isTimelineAnswer("3_months")).toBe(true);
    expect(isTimelineAnswer("soon")).toBe(false);
    expect(isTimelineAnswer(null)).toBe(false);
  });
});
