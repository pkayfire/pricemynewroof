// Site-wide settings. Location text never lives here; it always comes from estimate data.

export const SITE_NAME = "Price My New Roof";
export const SITE_DOMAIN = "pricemynewroof.com";
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || `https://${SITE_DOMAIN}`).replace(/\/$/, "");

import { BUYER_CONFIG } from "@/lib/buyer/config";
import type { BuyerMode } from "@/lib/api/contracts";

export type { BuyerMode };

/** The buyer mode from lib/buyer/config.ts (v1: "manual"), for copy. */
export const BUYER_MODE: BuyerMode = BUYER_CONFIG.buyerMode;

// DECISION: false until a paying buyer is confirmed; referral copy mentions payment only then
// (Build decisions, Leads).
export const PAYING_BUYER_CONFIRMED = false;
