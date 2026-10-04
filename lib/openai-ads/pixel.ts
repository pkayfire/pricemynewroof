// OpenAI Pixel config for the UI (Milestone 3 renders the script). Off unless OPENAI_PIXEL_ID and
// OPENAI_CAPI_TOKEN are both set, and never for an opted-out session (do-not-sell or GPC).
// Per https://developers.openai.com/ads/measurement-pixel: load PIXEL_SCRIPT_SRC, then
// oaiq("init", { pixelId }) and oaiq("measure", eventName, eventData, options).
// The UI must also check browserOptedOut() (lib/privacy/client.ts) before loading it.

export const PIXEL_SCRIPT_SRC = "https://bzrcdn.openai.com/sdk/oaiq.min.js";

export type PixelConfig = { enabled: false } | { enabled: true; pixelId: string; scriptSrc: string };

export function pixelConfig(opts: { optedOut: boolean }, env: NodeJS.ProcessEnv = process.env): PixelConfig {
  const pixelId = env.OPENAI_PIXEL_ID?.trim();
  if (!pixelId || !env.OPENAI_CAPI_TOKEN?.trim() || opts.optedOut) return { enabled: false };
  return { enabled: true, pixelId, scriptSrc: PIXEL_SCRIPT_SRC };
}

export { PIXEL_EVENTS } from "./pixel-events";
