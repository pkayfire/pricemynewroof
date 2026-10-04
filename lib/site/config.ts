// Site-wide settings. Location text never lives here; it always comes from estimate data.

export const SITE_NAME = "Price My New Roof";
export const SITE_DOMAIN = "pricemynewroof.com";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${SITE_DOMAIN}`).replace(/\/$/, "");

export type BuyerMode = "none" | "manual" | "service_direct";

// DECISION: the spec puts buyerMode in config (Coverage, leads and calls). Milestone 4 moves it
// there; until then the frontend reads this constant. v1 ships with "manual".
export const BUYER_MODE: BuyerMode = "manual";

// DECISION: false until a paying buyer is confirmed; referral copy mentions payment only then
// (Build decisions, Leads).
export const PAYING_BUYER_CONFIRMED = false;
