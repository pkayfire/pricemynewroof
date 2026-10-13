import { describe, expect, it } from "vitest";
import { callEventId, isCallEventId, leadEventId } from "@/lib/openai-ads/event-id";
import { PIXEL_EVENTS } from "@/lib/openai-ads/pixel-events";

describe("pixel event map", () => {
  it("reports a quote request as lead_created (customer_action), page views as page_viewed", () => {
    expect(PIXEL_EVENTS.form_submit).toEqual({ name: "lead_created", data: { type: "customer_action" } });
    expect(PIXEL_EVENTS.page_view).toEqual({ name: "page_viewed" });
  });

  it("shares one event ID format with the Conversions API so OpenAI deduplicates", () => {
    expect(leadEventId("abc")).toBe("lead_abc");
  });

  it("reports a call click as lead_created plus a custom call_click, one conversion per estimate", () => {
    expect(PIXEL_EVENTS.call_click).toEqual([
      { name: "lead_created", data: { type: "customer_action" } },
      { name: "custom", custom: "call_click" },
    ]);
    const id = callEventId("00000000-0000-4000-8000-000000000001");
    expect(id).toBe("call_00000000-0000-4000-8000-000000000001");
    expect(isCallEventId(id)).toBe(true);
    for (const bad of ["call_x", "lead_00000000-0000-4000-8000-000000000001", "call_00000000-0000-4000-8000-000000000001 "]) expect(isCallEventId(bad)).toBe(false);
  });
});
