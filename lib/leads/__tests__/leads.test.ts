import { describe, expect, it } from "vitest";
import { CONSENT_TEXTS, consentFor } from "@/lib/api/consent";
import type { LeadRequest } from "@/lib/api/contracts";
import { requestContext, type RequestContext } from "@/lib/attribution";
import { handleLeadPost } from "@/lib/leads/endpoints";
import { toE164US } from "@/lib/leads/phone";
import { handleLead } from "@/lib/leads/service";
import { sha256Hex } from "@/lib/server/hash";
import { DAY, ESTIMATE_ID, estimateRecord, m4Setup, postJson, T0 } from "@/test/m4";

const CONSENT = consentFor("manual")!;

const valid = (over: Partial<LeadRequest> = {}): LeadRequest => ({
  estimateId: ESTIMATE_ID,
  name: "Pat Example",
  phone: "(602) 555-0123",
  email: "Pat@Example.com",
  timing: "within_3_months",
  consentVersion: CONSENT.version,
  consent: true,
  pageUrl: "https://example.test/estimate/x/quote",
  ...over,
});

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({
  ip: "203.0.113.7",
  userAgent: "Mozilla/5.0 test",
  referer: null,
  sessionId: "sess-1",
  attribution: { oppref: "opp-abc", ad_group_id: "ag-7", utm_source: "chatgpt" },
  obref: null,
  optedOut: false,
  ...over,
});

async function seeded(buyer = {}) {
  const s = m4Setup(buyer);
  await s.estimates.insert(estimateRecord());
  return s;
}

describe("phone normalization", () => {
  it("accepts common US formats as E.164", () => {
    for (const p of ["(602) 555-0123", "602-555-0123", "602.555.0123", "6025550123", "+1 602 555 0123", "1-602-555-0123"]) {
      expect(toE164US(p)).toBe("+16025550123");
    }
  });
  it("rejects invalid and non-US numbers", () => {
    for (const p of ["555-0123", "102-555-0123", "602-055-0123", "911-555-0123", "+44 20 7946 0958", "602555012345", "call me", "+1 602 555 012x"]) {
      expect(toE164US(p)).toBeNull();
    }
  });
});

describe("POST /api/lead validation", () => {
  it("rejects a bad phone", async () => {
    const s = await seeded();
    const r = await handleLead(valid({ phone: "555-0123" }), ctx(), s.leadDeps);
    expect(r).toMatchObject({ status: 400, body: { error: "invalid_phone", field: "phone" } });
    expect(s.leads.rows.size).toBe(0);
  });

  it("requires the consent checkbox to be true", async () => {
    const s = await seeded();
    for (const consent of [false, undefined, "true"]) {
      const r = await handleLead({ ...valid(), consent } as unknown, ctx(), s.leadDeps);
      expect(r).toMatchObject({ status: 400, body: { error: "invalid_request", field: "consent" } });
    }
    expect(s.leads.rows.size).toBe(0);
  });

  it("rejects an unknown consent version", async () => {
    const s = await seeded();
    const r = await handleLead(valid({ consentVersion: "old-v0" }), ctx(), s.leadDeps);
    expect(r).toMatchObject({ status: 400, body: { error: "unknown_consent_version" } });
  });

  it("rejects bad email, timing, name and unknown fields", async () => {
    const s = await seeded();
    expect((await handleLead(valid({ email: "nope" }), ctx(), s.leadDeps)).status).toBe(400);
    expect((await handleLead({ ...valid(), timing: "someday" }, ctx(), s.leadDeps)).status).toBe(400);
    expect((await handleLead(valid({ name: " " }), ctx(), s.leadDeps)).status).toBe(400);
    expect((await handleLead({ ...valid(), address: "x" }, ctx(), s.leadDeps)).status).toBe(400);
  });

  it("rejects an unknown estimate and an uncovered ZIP", async () => {
    const s = await seeded({ coverage: { kind: "allowlist", zips: ["10001"], zip3: [] } });
    expect(await handleLead(valid(), ctx(), s.leadDeps)).toMatchObject({ status: 422, body: { error: "not_covered" } });
    expect(await handleLead(valid({ estimateId: "00000000-0000-4000-8000-000000000999" }), ctx(), s.leadDeps)).toMatchObject({
      status: 404,
      body: { error: "estimate_not_found" },
    });
    expect(s.leads.rows.size).toBe(0);
    expect(s.email.sent).toHaveLength(0);
  });
});

describe("POST /api/lead persistence", () => {
  it("saves the lead with its consent record, estimate summary and attribution", async () => {
    const s = await seeded();
    const r = await handleLead(valid(), ctx(), s.leadDeps);
    expect(r).toEqual({ status: 200, body: { ok: true, leadId: "10000000-0000-4000-8000-000000000001" } });
    const lead = await s.leads.get("10000000-0000-4000-8000-000000000001");
    expect(lead).toMatchObject({
      estimateId: ESTIMATE_ID,
      name: "Pat Example",
      phone: "+16025550123",
      email: "Pat@Example.com",
      timing: "within_3_months",
      zip: "85032",
      state: "AZ",
      consentVersion: "manual-2026-10-03",
      consentTs: T0.toISOString(),
      consentCertId: null,
      ip: "203.0.113.7",
      userAgent: "Mozilla/5.0 test",
      pageUrl: "https://example.test/estimate/x/quote",
      estimateSummary: { squares: 20.4, maxPitch: "8/12", currentRoof: "tile" },
      attribution: { oppref: "opp-abc", ad_group_id: "ag-7", utm_source: "chatgpt" },
      sessionId: "sess-1",
      optOut: false,
      forwardStatus: "manual_pending",
      forwardedAt: null,
      duplicateOf: null,
    });
    // The hash is SHA-256 of the exact text shown for that version.
    expect(lead?.consentTextHash).toBe(sha256Hex(CONSENT_TEXTS["manual-2026-10-03"].text));
    expect(lead?.consentTextHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("stores a consent certificate ID when given, and falls back to the Referer for the page URL", async () => {
    const s = await seeded();
    await handleLead(valid({ consentCertId: "cert-123", pageUrl: undefined }), ctx({ referer: "https://example.test/estimate/y/quote" }), s.leadDeps);
    const [lead] = [...s.leads.rows.values()];
    expect(lead.consentCertId).toBe("cert-123");
    expect(lead.pageUrl).toBe("https://example.test/estimate/y/quote");
  });

  it("consent text describes manual forwarding and the referral role, with no payment claim", () => {
    expect(CONSENT.text).toMatch(/A person at Price My New Roof passes each request to a local roofer/);
    expect(CONSENT.text).toMatch(/referral service, not a contractor/);
    expect(CONSENT.text).not.toMatch(/pay us/i);
  });

  it("sends one alert per lead, without contact details, linking to /admin/leads", async () => {
    const s = await seeded();
    await handleLead(valid(), ctx(), s.leadDeps);
    expect(s.email.sent).toHaveLength(1);
    const m = s.email.sent[0];
    expect(m).toMatchObject({ kind: "lead_alert", to: "admin@example.test" });
    expect(m.text).toContain("https://example.test/admin/leads");
    for (const pii of ["Pat", "602", "5550123", "example.com"]) expect(m.subject + m.text).not.toContain(pii);
  });

  it("a failing alert email doesn't fail the lead", async () => {
    const s = await seeded();
    s.leadDeps.email = { send: async () => Promise.reject(new Error("smtp down")) };
    expect((await handleLead(valid(), ctx(), s.leadDeps)).status).toBe(200);
    expect(s.leads.rows.size).toBe(1);
  });
});

describe("dedupe", () => {
  it("accepts the same phone within 30 days but doesn't forward or alert again", async () => {
    const s = await seeded();
    const first = await handleLead(valid(), ctx(), s.leadDeps);
    s.setNow(new Date(T0.getTime() + 29 * DAY));
    const second = await handleLead(valid({ phone: "+1 602-555-0123", email: "other@example.org" }), ctx(), s.leadDeps);
    expect(second.status).toBe(200);
    const firstId = (first.body as { leadId: string }).leadId;
    const secondLead = await s.leads.get((second.body as { leadId: string }).leadId);
    expect(secondLead).toMatchObject({ forwardStatus: "duplicate", duplicateOf: firstId });
    expect(s.email.sent).toHaveLength(1);
    // A third points at the original, not the duplicate.
    const third = await handleLead(valid(), ctx(), s.leadDeps);
    expect((await s.leads.get((third.body as { leadId: string }).leadId))?.duplicateOf).toBe(firstId);
  });

  it("treats the same phone after 30 days as a new lead", async () => {
    const s = await seeded();
    await handleLead(valid(), ctx(), s.leadDeps);
    s.setNow(new Date(T0.getTime() + 31 * DAY));
    const r = await handleLead(valid(), ctx(), s.leadDeps);
    expect((await s.leads.get((r.body as { leadId: string }).leadId))?.forwardStatus).toBe("manual_pending");
    expect(s.email.sent).toHaveLength(2);
  });
});

describe("forward status per buyerMode", () => {
  it("manual → manual_pending, none → held", async () => {
    const manual = await seeded({ buyerMode: "manual" });
    await handleLead(valid(), ctx(), manual.leadDeps);
    expect([...manual.leads.rows.values()][0].forwardStatus).toBe("manual_pending");
    const none = await seeded({ buyerMode: "none" });
    await handleLead(valid(), ctx(), none.leadDeps);
    expect([...none.leads.rows.values()][0].forwardStatus).toBe("held");
  });

  it("service_direct: refused until the buyer's consent text exists; with one, the stub queues the lead", async () => {
    const sd = await seeded({ buyerMode: "service_direct", coverage: { kind: "all_us" } });
    // The Service Direct coverage provider is a stub (nothing covered), so use config coverage here.
    sd.leadDeps.coverage = { forZip: async () => ({ covered: true, leadTypes: ["form"] }) };
    expect(await handleLead(valid(), ctx(), sd.leadDeps)).toMatchObject({ status: 503, body: { error: "consent_unavailable" } });
    sd.leadDeps.consentFor = () => CONSENT;
    expect((await handleLead(valid(), ctx(), sd.leadDeps)).status).toBe(200);
    expect([...sd.leads.rows.values()][0].forwardStatus).toBe("queued");
  });
});

describe("opt-outs on leads", () => {
  it("marks the lead opted out under Global Privacy Control", async () => {
    const s = await seeded();
    const req = postJson("/api/lead", valid(), { "sec-gpc": "1" });
    const c = requestContext(req, "203.0.113.7");
    expect(c.optedOut).toBe(true);
    await handleLead(valid(), c, s.leadDeps);
    expect([...s.leads.rows.values()][0].optOut).toBe(true);
  });

  it("marks the lead opted out when the email has a do-not-sell request", async () => {
    const s = await seeded();
    await s.doNotSell.insert({ id: "d", createdAt: T0.toISOString(), email: "pat@example.com", name: null, state: "CA", ipHash: null, sessionId: null });
    await handleLead(valid(), ctx(), s.leadDeps);
    expect([...s.leads.rows.values()][0].optOut).toBe(true);
  });
});

describe("POST /api/lead over HTTP", () => {
  it("reads attribution and session from cookies, and rate-limits per IP", async () => {
    const s = await seeded();
    const attr = encodeURIComponent(JSON.stringify({ oppref: "opp-cookie", ad_group_id: "ag-1" }));
    const res = await handleLeadPost(
      postJson("/api/lead", { ...valid(), pageUrl: undefined }, { cookie: `pmnr_sid=sess-cookie-123; pmnr_attr=${attr}; __obref=ob-1`, "user-agent": "UA" }),
      () => s.leadDeps,
    );
    expect(res.status).toBe(200);
    const lead = [...s.leads.rows.values()][0];
    expect(lead).toMatchObject({ sessionId: "sess-cookie-123", attribution: { oppref: "opp-cookie", ad_group_id: "ag-1", obref: "ob-1" }, userAgent: "UA" });

    for (let i = 0; i < 19; i++) await handleLeadPost(postJson("/api/lead", { bad: true }), () => s.leadDeps);
    const limited = await handleLeadPost(postJson("/api/lead", valid()), () => s.leadDeps);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("rejects non-JSON and oversized bodies", async () => {
    const s = await seeded();
    expect((await handleLeadPost(postJson("/api/lead", "{not json"), () => s.leadDeps)).status).toBe(400);
    expect((await handleLeadPost(postJson("/api/lead", { name: "x".repeat(10_000) }), () => s.leadDeps)).status).toBe(413);
  });
});
