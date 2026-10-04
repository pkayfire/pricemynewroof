import { describe, expect, it } from "vitest";
import { leadEventId } from "@/lib/openai-ads/event-id";
import { PIXEL_EVENTS } from "@/lib/openai-ads/pixel-events";

describe("pixel event map", () => {
  it("reports a quote request as lead_created (customer_action), page views as page_viewed", () => {
    expect(PIXEL_EVENTS.form_submit).toEqual({ name: "lead_created", data: { type: "customer_action" } });
    expect(PIXEL_EVENTS.page_view).toEqual({ name: "page_viewed" });
  });

  it("shares one event ID format with the Conversions API so OpenAI deduplicates", () => {
    expect(leadEventId("abc")).toBe("lead_abc");
  });
});
