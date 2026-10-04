// Funnel events the OpenAI Pixel reports, as OpenAI event name (+ custom_event_name). Client-safe.
// DECISION (accepted): only page_view maps to a standard event (page_viewed); funnel steps are
// custom events. form_submit is NOT sent as lead_created: the Conversions API sends lead_created
// when a lead is actually forwarded, so bidding optimizes toward forwarded leads.
import type { ClientEvent } from "@/lib/api/contracts";

export const PIXEL_EVENTS: Partial<Record<ClientEvent, { name: string; custom?: string }>> = {
  page_view: { name: "page_viewed" },
  estimate_shown: { name: "custom", custom: "estimate_shown" },
  form_submit: { name: "custom", custom: "form_submit" },
  call_click: { name: "custom", custom: "call_click" },
};
