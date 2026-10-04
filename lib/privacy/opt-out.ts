// Opt-out signals: a do-not-sell request (pmnr_optout cookie) or Global Privacy Control
// (Sec-GPC: 1). An opted-out session gets no OpenAI Pixel and no Conversions API events.
import { OPT_OUT_COOKIE } from "@/lib/api/contracts";

export const GPC_HEADER = "sec-gpc";
export const OPT_OUT_MAX_AGE_S = 365 * 24 * 60 * 60;

export function hasGpc(headers: Headers): boolean {
  return headers.get(GPC_HEADER)?.trim() === "1";
}

export function isOptedOut(headers: Headers, cookies: Record<string, string>): boolean {
  return hasGpc(headers) || cookies[OPT_OUT_COOKIE] === "1";
}
