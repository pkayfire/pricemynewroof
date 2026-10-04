// Referral and disclosure copy that depends on buyerMode (docs/SPEC.md Build decisions, Leads).
// Copy must describe what actually happens to a request in the active mode.
import { BUYER_MODE, PAYING_BUYER_CONFIRMED, SITE_NAME, type BuyerMode } from "./config";

/** Sentence under the quote CTA on the estimate page. */
export function referralSentence(mode: BuyerMode = BUYER_MODE, paid = PAYING_BUYER_CONFIRMED): string {
  const pay = paid ? " They pay us for the referral." : "";
  switch (mode) {
    case "manual":
      return `We'll pass your request to a local roofer within one business day.${pay}`;
    case "service_direct":
      return `We'll pass your request to a local roofer.${pay}`;
    case "none":
      // Development only; ads never run in this mode (spec, Lead intake).
      return "Quote requests are not being forwarded to roofers right now.";
  }
}

/** Referral disclosure used on the landing page and in the footer. */
export function referralDisclosure(mode: BuyerMode = BUYER_MODE, paid = PAYING_BUYER_CONFIRMED): string {
  const base = `${SITE_NAME} is an independent referral service, not a roofing contractor.`;
  const forward =
    mode === "none"
      ? " Quote requests are not being forwarded to roofers right now."
      : mode === "manual"
        ? " If you ask for quotes, we pass your request to a local roofer within one business day."
        : " If you ask for quotes, we pass your request to a local roofer.";
  const pay = paid ? " Roofers pay us for the referral." : "";
  return `${base}${forward}${pay} Seeing your estimate never shares your details.`;
}
