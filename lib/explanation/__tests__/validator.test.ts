import { describe, expect, it } from "vitest";
import { countSentences, validateExplanation } from "../validator";
import { extractNumbers } from "../numbers";
import { SPEC_DRIVERS } from "./fixtures";

const ok = (text: string, latency = 0) => validateExplanation(text, SPEC_DRIVERS, latency);

describe("extractNumbers", () => {
  it("finds digits, percentages, pitches and spelled-out numbers", () => {
    const { numbers, pitches } = extractNumbers("About 30% is steep, up to 8/12, across nine sections and 1,200 feet.");
    expect(pitches).toEqual([8]);
    expect(numbers.map((n) => [n.value, n.percent])).toEqual([
      [30, true],
      [1200, false],
      [9, false],
    ]);
  });

  it("reads compound and fractional words", () => {
    const vals = extractNumbers("twenty-one planes, two thirds of it, eight percent above").numbers;
    expect(vals.map((n) => n.value)).toEqual([21, 2 / 3, 8]);
    expect(vals[2].percent).toBe(true);
  });
});

describe("validateExplanation", () => {
  const good =
    "Your roof is about 20 squares across 9 sections, and about 30% of it is steep, up to 8/12. Roofing labor in the Phoenix area runs about 8% below the national average.";

  it("accepts text whose numbers all come from the drivers", () => {
    expect(ok(good)).toEqual({ ok: true, failures: [] });
  });

  it("allows rounding and percent formatting", () => {
    expect(ok("Your roof is about 20.4 squares. Labor is about 59% of the cost.").ok).toBe(true);
    expect(ok("Your roof is about 21 squares. Labor is 59 percent of the cost.").ok).toBe(true);
    expect(ok("Your roof is about 20 squares. Materials are up 3% since the base date.").ok).toBe(true);
  });

  it("rejects numbers that aren't in the drivers", () => {
    const r = ok("Your roof is about 25 squares across 9 sections. Labor runs 8% below average.");
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("number not in drivers: 25");
    expect(ok("Your roof has 9 sections. About 45% of it is steep.").ok).toBe(false);
    expect(ok("Your roof has 9 sections. Labor is about 0.7 of the cost.").ok).toBe(false);
  });

  it("treats spelled-out numbers as numbers", () => {
    expect(ok("Your roof spreads across nine sections. Labor runs eight percent below average.").ok).toBe(true);
    const r = ok("Your roof spreads across six sections. Labor runs below the national average.");
    expect(r.ok).toBe(false);
    expect(r.failures).toContain("number not in drivers: six");
    expect(ok("It is one of the steeper roofs around. Labor runs below the national average.").ok).toBe(false);
  });

  it("rejects pitches other than maxPitch", () => {
    const r = ok("Most planes are 6/12 and the steepest is 8/12. Labor runs about 8% below average.");
    expect(r.failures).toContain("pitch not in drivers: 6/12");
  });

  it("rejects any mention of money", () => {
    expect(ok("Your roof is about 20 squares. It costs $16,743 in total.").failures).toContain("mentions money");
    expect(ok("Your roof is about 20 squares. Labor adds thousands of dollars.").failures).toContain("mentions money");
  });

  it.each(["guaranteed", "exact", "exactly", "promise", "best price", "cheapest"])("rejects the banned term %s", (term) => {
    const r = ok(`Your roof is about 20 squares. This is the ${term} figure for the Phoenix area.`);
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.startsWith("banned term"))).toBe(true);
  });

  it("enforces 2–3 sentences and 400 characters", () => {
    expect(ok("Your roof is about 20 squares.").failures).toContain("sentences: 1");
    expect(ok("One sentence. Two. Three here. Four now.").ok).toBe(false);
    const long = `Your roof is about 20 squares across 9 sections${" and it is large".repeat(30)}. Labor runs 8% below average.`;
    expect(long.length).toBeGreaterThan(400);
    expect(ok(long).failures.some((f) => f.startsWith("too long"))).toBe(true);
    expect(ok("Your roof is about 20 squares. Labor runs 8% below average").failures).toContain("unfinished sentence");
  });

  it("rejects responses slower than 1.5 seconds", () => {
    expect(ok(good, 1501).failures).toContain("slow: 1501 ms");
    expect(ok(good, 1500).ok).toBe(true);
  });

  it("ignores digits that are part of the area name and the U.S. abbreviation", () => {
    const d = { ...SPEC_DRIVERS, areaName: "Area 51" };
    expect(
      validateExplanation("Roofing labor in the Area 51 area runs about 8% below the U.S. average. Your roof is about 20 squares.", d)
        .ok,
    ).toBe(true);
    expect(countSentences("Labor runs below the U.S. average. Your roof is big.")).toBe(2);
  });
});
