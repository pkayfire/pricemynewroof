// Consent text shown next to the quote form checkbox (Compliance: TCPA; Build decisions, Leads).
// Client-safe so the form renders exactly this string. The server stores the version id and the
// SHA-256 of the text; never edit a published version's text: add a new version instead.
//
// PLACEHOLDER wording describing what actually happens in manual mode. Needs legal review
// before ads run, and the buyer's exact text once a buyer (e.g. Service Direct) is connected.
import type { BuyerMode } from "./contracts";

export interface ConsentText {
  version: string;
  text: string;
}

export const CONSENT_TEXTS = {
  "manual-2026-10-03": {
    version: "manual-2026-10-03",
    text:
      "By checking this box, I ask Price My New Roof to share my name, phone number, email, ZIP code, " +
      "project timing and this roof estimate with a local roofing company so it can contact me about a quote. " +
      "A person at Price My New Roof passes each request to a local roofer, usually within one business day. " +
      "That roofer may call, text or email me about my project at the phone number and email I entered. " +
      "Price My New Roof is a referral service, not a contractor. " +
      "Consent is not a condition of any purchase, and I can ask not to be contacted at any time. " +
      "Message and data rates may apply.",
  },
} as const satisfies Record<string, ConsentText>;

export type ConsentVersion = keyof typeof CONSENT_TEXTS;

/**
 * The consent text for the active buyer mode, or null when no text exists for it.
 * DECISION: none mode (development only) reuses the manual text. service_direct has no text
 * until Service Direct supplies its required consent language, so leads are refused in that mode.
 */
export function consentFor(mode: BuyerMode): ConsentText | null {
  switch (mode) {
    case "manual":
    case "none":
      return CONSENT_TEXTS["manual-2026-10-03"];
    case "service_direct":
      return null;
  }
}
