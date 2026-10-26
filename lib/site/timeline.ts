// "When are you planning to replace your roof?" (Oct 26 experiment, docs/SPEC.md Build decisions).
// Asked above the estimate sheet's call button. Visitors replacing soon see the call first; the rest
// see the measurements email first, with the call under it.

export const TIMELINE_QUESTION = "When are you planning to replace your roof?";

export const TIMELINE_ANSWERS = [
  { id: "3_months", label: "Within 3 months" },
  { id: "this_year", label: "This year" },
  { id: "researching", label: "Just researching" },
] as const;

export type TimelineAnswer = (typeof TIMELINE_ANSWERS)[number]["id"];

/** Window event the sheet fires with the answer, so the phone call bar can follow it. */
export const TIMELINE_EVENT = "pmnr:timeline";

export function isTimelineAnswer(v: unknown): v is TimelineAnswer {
  return TIMELINE_ANSWERS.some((a) => a.id === v);
}

/** The call leads until the visitor says they're replacing later than 3 months out. */
export function callFirst(answer: TimelineAnswer | null): boolean {
  return answer === null || answer === "3_months";
}
