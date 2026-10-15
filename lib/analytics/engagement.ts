// Estimate page engagement (Oct 14): how far people scroll and how long the page is visible, so a
// visitor who leaves in seconds can be told apart from one who reads everything and doesn't call.
// Pure helpers; components/analytics/EstimateEngagement.tsx sends the events.

export const SCROLL_MILESTONES = [25, 50, 75, 100] as const;

/** Percent of the page seen (bottom of the viewport / page height), 0–100. */
export function scrollPercent(scrollY: number, viewportHeight: number, pageHeight: number): number {
  if (pageHeight <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((scrollY + viewportHeight) / pageHeight) * 100)));
}

/** Milestones newly reached, given the deepest milestone already recorded. */
export function newMilestones(recorded: number, percent: number): number[] {
  // 98% counts as the bottom: browsers rarely report exactly 100.
  const p = percent >= 98 ? 100 : percent;
  return SCROLL_MILESTONES.filter((m) => m > recorded && m <= p);
}
