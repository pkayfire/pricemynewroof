// Funnel events the OpenAI Pixel reports, as OpenAI event name (+ custom_event_name). Client-safe.
// page_view → page_viewed; form_submit (a quote request) → lead_created (owner decision: feed the
// conversion as early as possible). The server sends the same lead_created through the Conversions
// API with the same event_id, so OpenAI counts it once. Other funnel steps are custom events.
import type { ClientEvent } from "@/lib/api/contracts";

export interface PixelEvent {
  name: string;
  custom?: string;
  data?: Record<string, string>;
}

export const PIXEL_EVENTS: Partial<Record<ClientEvent, PixelEvent>> = {
  page_view: { name: "page_viewed" },
  estimate_shown: { name: "custom", custom: "estimate_shown" },
  form_submit: { name: "lead_created", data: { type: "customer_action" } },
  call_click: { name: "custom", custom: "call_click" },
};
