// Browser-side opt-out check for the UI (Milestone 3): call before loading the OpenAI Pixel.
// Opted out when Global Privacy Control is on or a do-not-sell request set the pmnr_optout cookie.
import { OPT_OUT_COOKIE } from "@/lib/api/contracts";

export function browserOptedOut(): boolean {
  if (typeof navigator === "undefined" || typeof document === "undefined") return true; // not in a browser: never track
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const cookie = document.cookie.split(";").some((c) => c.trim() === `${OPT_OUT_COOKIE}=1`);
  return gpc || cookie;
}
