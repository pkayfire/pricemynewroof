// Landing hero copy. The headline varies by ad group (docs/SPEC.md Build decisions, Frontend);
// ads link to /?...&ad_group_id=<slug>. Only exact known slugs change the headline.

export const DEFAULT_LANDING_HEADLINE = "See what a new roof should cost for your house";

const HEADLINES_BY_AD_GROUP: Readonly<Record<string, string>> = {
  "cost-research": DEFAULT_LANDING_HEADLINE,
  "repair-or-replace": "Thinking about replacing your roof? See what it would cost first.",
  "tile-roofs": "Keep your tiles or replace them? Compare the costs for your roof.",
  "ready-to-replace": "Replacing your roof? Know what it should cost before you hire a roofer.",
};

export const LANDING_LEDE =
  "Enter your address to get a price range for your roof in a few seconds, measured from satellite imagery and priced with local labor costs.";

export const LANDING_CTA = "See my price";
export const LANDING_CTA_SUBMITTING = "Measuring your roof…";
export const LANDING_HINT = "Free, and no phone number or email needed. We only use your address to find your roof.";
export const LANDING_HINT_SUBMITTING = "This usually takes a few seconds.";

/** Hero headline for the landing page's `ad_group_id` query param. Unknown or missing values get the default. */
export function landingHeadline(adGroupId: string | undefined): string {
  if (adGroupId && Object.hasOwn(HEADLINES_BY_AD_GROUP, adGroupId)) return HEADLINES_BY_AD_GROUP[adGroupId];
  return DEFAULT_LANDING_HEADLINE;
}
