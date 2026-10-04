// Deterministic template (docs/SPEC.md "Template fallback"):
// "Your roof is about {squares} squares across {sections} sections. {steepSentence} Roofing labor in
// the {areaName} area runs about {laborPct}% {above/below} the national average."
// Area naming follows wageSource: metro → "the {areaName} area"; state and national are said plainly.
import type { Drivers } from "@/lib/api/types";

const pct = (v: number) => Math.round(Math.abs(v) * 100);

function sizeSentence(d: Drivers): string {
  const sq = String(d.squares);
  if (d.sections === null) return `Your roof is about ${sq} squares, estimated from your home's size.`;
  const noun = d.sections === 1 ? "section" : "sections";
  return `Your roof is about ${sq} squares across ${d.sections} ${noun}.`;
}

function steepSentence(d: Drivers): string {
  if (d.sections === null) return "Without satellite measurements the range is wider.";
  const share = pct(d.steepShare);
  if (share > 0 && d.maxPitch)
    return `About ${share}% of it is steep, up to ${d.maxPitch}, which takes extra time and safety work.`;
  return "None of it is steep, so it's quicker to work on safely.";
}

function laborSentence(d: Drivers): string {
  const p = pct(d.laborVsNational);
  const dir = d.laborVsNational > 0 ? "above" : "below";
  switch (d.wageSource) {
    case "metro":
      return p === 0
        ? `Roofing labor in the ${d.areaName} area runs close to the national average.`
        : `Roofing labor in the ${d.areaName} area runs about ${p}% ${dir} the national average.`;
    case "state":
      return p === 0
        ? `Local wage data isn't published for your area, so labor uses the ${d.areaName} state figure, close to the national average.`
        : `Local wage data isn't published for your area, so labor uses the ${d.areaName} state figure, about ${p}% ${dir} the national average.`;
    case "national":
      return "Local wage data isn't available for your area, so labor is priced at the national average.";
  }
}

export function templateExplanation(d: Drivers): string {
  return `${sizeSentence(d)} ${steepSentence(d)} ${laborSentence(d)}`;
}
