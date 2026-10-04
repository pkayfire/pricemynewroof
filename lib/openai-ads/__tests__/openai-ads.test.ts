import { describe, expect, it, vi } from "vitest";
import { markLeadForwarded } from "@/lib/leads/mark-forwarded";
import { buildCapiEvent, conversionsFromEnv, type ConversionEvent } from "@/lib/openai-ads/capi";
import { normalizePhone } from "@/lib/openai-ads/hash";
import { pixelConfig } from "@/lib/openai-ads/pixel";
import { sha256Hex } from "@/lib/server/hash";
import type { LeadRecord } from "@/lib/server/stores";
import { m4Setup, T0, dnsRecord } from "@/test/m4";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const ON = env({ OPENAI_PIXEL_ID: "oai-px-TEST", OPENAI_CAPI_TOKEN: "tok-secret" });

const event = (over: Partial<ConversionEvent> = {}): ConversionEvent => ({
  kind: "lead_forwarded",
  id: "lead_abc",
  at: T0,
  sourceUrl: "https://example.test/estimate/e/quote",
  email: "  Pat@Example.com ",
  phone: "+16025550123",
  oppref: "opp-1",
  obref: "ob-1",
  optedOut: false,
  ...over,
});

function fakeFetch(status = 200) {
  return vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => new Response("{}", { status }));
}

describe("OpenAI Conversions API", () => {
  it("is disabled unless both OPENAI_PIXEL_ID and OPENAI_CAPI_TOKEN are set", async () => {
    for (const e of [env({}), env({ OPENAI_PIXEL_ID: "oai-px-TEST" }), env({ OPENAI_CAPI_TOKEN: "tok" })]) {
      const f = fakeFetch();
      const c = conversionsFromEnv(e, f as unknown as typeof fetch);
      expect(c.enabled).toBe(false);
      expect(await c.send(event())).toBe("disabled");
      expect(f).not.toHaveBeenCalled();
    }
  });

  it("posts lead_created with bearer auth and only hashed PII", async () => {
    const f = fakeFetch();
    const c = conversionsFromEnv(ON, f as unknown as typeof fetch);
    expect(await c.send(event())).toBe("sent");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(String(url)).toBe("https://bzr.openai.com/v1/events?pid=oai-px-TEST");
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer tok-secret");
    const body = String(init!.body);
    for (const raw of ["Pat@Example.com", "pat@example.com", "6025550123", "+1602"]) expect(body).not.toContain(raw);
    const parsed = JSON.parse(body);
    expect(parsed).toEqual({
      validate_only: false,
      events: [
        {
          id: "lead_abc",
          type: "lead_created",
          timestamp_ms: T0.getTime(),
          source_url: "https://example.test/estimate/e/quote",
          action_source: "web",
          oppref: "opp-1",
          data: { type: "customer_action" },
          user: {
            emails_sha256: [sha256Hex("pat@example.com")],
            phone_numbers_sha256: [sha256Hex("16025550123")],
            obref: "ob-1",
          },
        },
      ],
    });
  });

  it("sends call_qualified as a custom event", () => {
    expect(buildCapiEvent(event({ kind: "call_qualified", email: null, phone: null, obref: null }))).toMatchObject({
      type: "custom",
      custom_event_name: "call_qualified",
      data: { type: "custom" },
    });
    expect(buildCapiEvent(event({ email: null, phone: null, obref: null }))).not.toHaveProperty("user");
  });

  it("never sends for an opted-out person, and reports HTTP failures without throwing", async () => {
    const f = fakeFetch();
    const c = conversionsFromEnv(ON, f as unknown as typeof fetch);
    expect(await c.send(event({ optedOut: true }))).toBe("suppressed");
    expect(f).not.toHaveBeenCalled();
    const failing = conversionsFromEnv(ON, fakeFetch(400) as unknown as typeof fetch);
    expect(await failing.send(event())).toBe("failed");
    const throwing = conversionsFromEnv(ON, (async () => Promise.reject(new Error("net"))) as unknown as typeof fetch);
    expect(await throwing.send(event())).toBe("failed");
  });

  it("normalizes phones per OpenAI's rules", () => {
    expect(normalizePhone("+1 (602) 555-0123")).toBe("16025550123");
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("OpenAI Pixel config", () => {
  it("is off without env and for opted-out sessions", () => {
    expect(pixelConfig({ optedOut: false }, env({}))).toEqual({ enabled: false });
    expect(pixelConfig({ optedOut: false }, env({ OPENAI_PIXEL_ID: "oai-px-TEST" }))).toEqual({ enabled: false });
    expect(pixelConfig({ optedOut: true }, ON)).toEqual({ enabled: false });
    expect(pixelConfig({ optedOut: false }, ON)).toEqual({ enabled: true, pixelId: "oai-px-TEST", scriptSrc: "https://bzrcdn.openai.com/sdk/oaiq.min.js" });
  });
});

describe("marking a lead forwarded", () => {
  const lead = (over: Partial<LeadRecord> = {}): LeadRecord => ({
    id: "20000000-0000-4000-8000-000000000001",
    createdAt: T0.toISOString(),
    estimateId: "00000000-0000-4000-8000-000000000001",
    name: "Pat Example",
    phone: "+16025550123",
    email: "pat@example.com",
    timing: "asap",
    address: "100 Example Way, Testville, AZ 85032",
    zip: "85032",
    state: "AZ",
    consentVersion: "manual-2026-10-03",
    consentTextHash: "a".repeat(64),
    consentTs: T0.toISOString(),
    consentCertId: null,
    ip: "203.0.113.7",
    userAgent: "UA",
    pageUrl: "https://example.test/estimate/e/quote",
    estimateSummary: null,
    attribution: { oppref: "opp-1", ad_group_id: "ag-1" },
    sessionId: "sess-1",
    optOut: false,
    forwardStatus: "manual_pending",
    forwardedAt: null,
    buyerRef: null,
    duplicateOf: null,
    ...over,
  });

  function setup(l: LeadRecord) {
    const s = m4Setup();
    const f = fakeFetch();
    const deps = { leads: s.leads, events: s.events, doNotSell: s.doNotSell, conversions: conversionsFromEnv(ON, f as unknown as typeof fetch), now: s.now, siteUrl: "https://example.test" };
    return { s, f, deps, ready: s.leads.insert(l) };
  }

  it("sets status and time, records lead_forwarded with attribution, and sends the conversion once", async () => {
    const { s, f, deps, ready } = setup(lead());
    await ready;
    const r = await markLeadForwarded(lead().id, "Roofer A", deps);
    expect(r).toMatchObject({ status: 200, changed: true, conversion: "sent", lead: { forwardStatus: "forwarded", forwardedAt: T0.toISOString(), buyerRef: "Roofer A" } });
    expect(s.events.events).toEqual([
      { sessionId: "sess-1", name: "lead_forwarded", ts: T0.toISOString(), source: "server", attribution: { oppref: "opp-1", ad_group_id: "ag-1" }, props: { lead_id: lead().id, zip: "85032" } },
    ]);
    // Idempotent.
    expect(await markLeadForwarded(lead().id, null, deps)).toMatchObject({ status: 200, changed: false, conversion: null });
    expect(f).toHaveBeenCalledTimes(1);
    expect(s.events.events).toHaveLength(1);
    expect(await markLeadForwarded("20000000-0000-4000-8000-000000000999", null, deps)).toEqual({ status: 404 });
  });

  it("suppresses the conversion for GPC/opted-out leads and later do-not-sell requests", async () => {
    const a = setup(lead({ optOut: true }));
    await a.ready;
    expect((await markLeadForwarded(lead().id, null, a.deps)) as { conversion: string }).toMatchObject({ conversion: "suppressed" });
    expect(a.f).not.toHaveBeenCalled();

    const b = setup(lead());
    await b.ready;
    await b.s.doNotSell.insert(dnsRecord({ email: "pat@example.com" }));
    expect((await markLeadForwarded(lead().id, null, b.deps)) as { conversion: string }).toMatchObject({ conversion: "suppressed" });
    expect(b.f).not.toHaveBeenCalled();
  });
});
