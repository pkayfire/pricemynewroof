import { describe, expect, it } from "vitest";
import { CLIENT_EVENTS, FUNNEL_EVENTS, SERVER_ONLY_EVENTS } from "@/lib/api/contracts";
import { handleDoNotSellPost, handleEmailEstimatePost, handleEventsPost } from "@/lib/leads/endpoints";
import { dnsRecord, ESTIMATE_ID, estimateRecord, m4Setup, postJson, T0 } from "@/test/m4";

function eventsSetup() {
  const s = m4Setup();
  return { s, deps: () => ({ events: s.events, limiter: s.limiter, now: s.now }) };
}

describe("POST /api/events: call test conversion", () => {
  const CALL_ID = "call_00000000-0000-4000-8000-000000000001";
  function callSetup() {
    const s = m4Setup();
    const deps = () => ({ events: s.events, limiter: s.limiter, now: s.now, conversions: s.leadDeps.conversions, doNotSell: s.doNotSell, siteUrl: "https://example.test" });
    const attr = encodeURIComponent(JSON.stringify({ oppref: "o1", ad_group_id: "cost-research" }));
    const post = (props: Record<string, unknown>, cookie = `pmnr_attr=${attr}; pmnr_sid=sess-call-1; __obref=ob-9`, headers: Record<string, string> = {}) =>
      handleEventsPost(postJson("/api/events", { sessionId: "sess-call-1", name: "call_click", props }, { cookie, referer: "https://example.test/estimate/e", ...headers }), deps);
    return { s, post };
  }

  it("records call_click and sends lead_created with the pixel's event ID, oppref and obref", async () => {
    const { s, post } = callSetup();
    expect((await post({ position: "top", event_id: CALL_ID, has_number: false })).status).toBe(204);
    expect(s.events.events.map((e) => e.name)).toEqual(["call_click"]);
    expect(s.conversionsSent).toEqual([
      { kind: "lead_submitted", id: CALL_ID, at: T0, sourceUrl: "https://example.test/estimate/e", oppref: "o1", obref: "ob-9", optedOut: false },
    ]);
  });

  it("sends nothing without a valid call event ID, or for opted-out people", async () => {
    const a = callSetup();
    await a.post({ position: "top" });
    await a.post({ position: "top", event_id: "lead_abc" });
    expect(a.s.events.events).toHaveLength(2);
    expect(a.s.conversionsSent).toHaveLength(0);

    const gpc = callSetup();
    await gpc.post({ event_id: CALL_ID }, undefined, { "sec-gpc": "1" });
    const dns = callSetup();
    await dns.s.doNotSell.insert(dnsRecord({ sessionId: "sess-call-1" }));
    await dns.post({ event_id: CALL_ID });
    expect([...gpc.s.conversionsSent, ...dns.s.conversionsSent]).toHaveLength(0);
  });
});

describe("POST /api/events", () => {
  it("has the spec's funnel events in order; lead_created, lead_forwarded and call_qualified are server-only", () => {
    expect(FUNNEL_EVENTS).toEqual([
      "page_view", "address_entered", "measured", "fallback_shown", "estimate_shown", "explanation_shown", "scroll_depth", "cta_seen", "link_click", "page_time", "quote_click",
      "call_click", "form_submit", "email_estimate", "lead_created", "lead_forwarded", "call_qualified",
    ]);
    expect(SERVER_ONLY_EVENTS).toEqual(["lead_created", "lead_forwarded", "call_qualified"]);
    expect(CLIENT_EVENTS).not.toContain("lead_created");
    expect(CLIENT_EVENTS).not.toContain("lead_forwarded");
  });

  it("appends a valid event with cookie attribution and returns 204", async () => {
    const { s, deps } = eventsSetup();
    const attr = encodeURIComponent(JSON.stringify({ oppref: "o1", ad_group_id: "ag-2", junk: "x" }));
    const res = await handleEventsPost(
      postJson("/api/events", { sessionId: "sess-1", name: "estimate_shown", props: { estimate_id: "e1", squares: 20.4, covered: true } }, { cookie: `pmnr_attr=${attr}` }),
      deps,
    );
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(s.events.events).toEqual([
      {
        sessionId: "sess-1",
        name: "estimate_shown",
        ts: T0.toISOString(),
        source: "client",
        attribution: { oppref: "o1", ad_group_id: "ag-2" },
        props: { estimate_id: "e1", squares: 20.4, covered: true },
      },
    ]);
  });

  it("defaults props to {}", async () => {
    const { s, deps } = eventsSetup();
    expect((await handleEventsPost(postJson("/api/events", { sessionId: "s", name: "page_view" }), deps)).status).toBe(204);
    expect(s.events.events[0].props).toEqual({});
  });

  it("rejects unknown and server-only names, nested or oversized props, and missing sessionId", async () => {
    const { s, deps } = eventsSetup();
    const bad = [
      { sessionId: "s", name: "purchase" },
      { sessionId: "s", name: "lead_forwarded" },
      { sessionId: "s", name: "call_qualified" },
      { sessionId: "s", name: "page_view", props: { nested: { a: 1 } } },
      { sessionId: "s", name: "page_view", props: Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])) },
      { sessionId: "s", name: "page_view", props: { "bad key": 1 } },
      { sessionId: "s", name: "page_view", props: { long: "x".repeat(301) } },
      { name: "page_view" },
      { sessionId: "s", name: "page_view", extra: 1 },
    ];
    for (const body of bad) expect((await handleEventsPost(postJson("/api/events", body), deps)).status).toBe(400);
    expect(s.events.events).toHaveLength(0);
  });

  it("refuses bodies over 4 KB with 413", async () => {
    const { deps } = eventsSetup();
    const big = { sessionId: "s", name: "page_view", props: { a: "x".repeat(5000) } };
    expect((await handleEventsPost(postJson("/api/events", big), deps)).status).toBe(413);
  });

  it("rate-limits per IP", async () => {
    const { deps } = eventsSetup();
    const d = deps();
    for (let i = 0; i < 600; i++) await d.limiter.hit("events", (await import("@/lib/ratelimit")).limitKey("ip", "203.0.113.7"), 600, 3600);
    const res = await handleEventsPost(postJson("/api/events", { sessionId: "s", name: "page_view" }), deps);
    expect(res.status).toBe(429);
  });
});

describe("POST /api/email-estimate", () => {
  it("stores the signup and emails the estimate", async () => {
    const s = m4Setup();
    await s.estimates.insert(estimateRecord());
    const deps = () => ({ getEstimate: s.getEstimate, signups: s.signups, email: s.email, limiter: s.limiter, now: s.now, newId: s.newId, siteUrl: "https://example.test" });
    const res = await handleEmailEstimatePost(postJson("/api/email-estimate", { estimateId: ESTIMATE_ID, email: "a@example.org", notifyWhenCovered: true }, { cookie: "pmnr_sid=sess-abc-123" }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(s.signups.rows[0]).toMatchObject({ estimateId: ESTIMATE_ID, email: "a@example.org", notifyWhenCovered: true, consentTs: T0.toISOString(), sessionId: "sess-abc-123" });
    expect(s.email.sent[0]).toMatchObject({ kind: "estimate", to: "a@example.org" });
    expect(s.email.sent[0].text).toContain("$12,000 to $18,500");
    expect(s.email.sent[0].text).toContain("A general estimate, not a quote.");
    expect(s.email.sent[0].text).toContain("referral service, not a contractor");
    expect(s.email.sent[0].text).toContain(`https://example.test/estimate/${ESTIMATE_ID}`);

    const missing = await handleEmailEstimatePost(postJson("/api/email-estimate", { estimateId: "00000000-0000-4000-8000-000000000999", email: "a@example.org", notifyWhenCovered: false }), deps);
    expect(missing.status).toBe(404);
    const bad = await handleEmailEstimatePost(postJson("/api/email-estimate", { estimateId: ESTIMATE_ID, email: "nope", notifyWhenCovered: false }), deps);
    expect(bad.status).toBe(400);
  });
});

describe("POST /api/do-not-sell", () => {
  it("stores the request with a hashed IP and sets the opt-out cookie", async () => {
    const s = m4Setup();
    const deps = () => ({ doNotSell: s.doNotSell, limiter: s.limiter, now: s.now, newId: s.newId });
    const res = await handleDoNotSellPost(
      postJson("/api/do-not-sell", { email: " Pat@Example.COM ", phone: "(602) 555-0123", state: "ca", authorizedAgent: true, details: "Please" }, { cookie: "pmnr_sid=sess-dns-1" }),
      deps,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/^pmnr_optout=1; Path=\/; Max-Age=\d+; SameSite=Lax; Secure$/);
    const row = s.doNotSell.rows[0];
    expect(row).toMatchObject({
      email: "pat@example.com",
      phone: "+16025550123",
      state: "CA",
      name: null,
      requestType: "opt_out_sale_share",
      authorizedAgent: true,
      details: "Please",
      sessionId: "sess-dns-1",
      createdAt: T0.toISOString(),
    });
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.7");
    expect(await s.doNotSell.isOptedOut({ email: "PAT@example.com" })).toBe(true);
    expect(await s.doNotSell.isOptedOut({ phone: "+16025550123" })).toBe(true);
    expect(await s.doNotSell.isOptedOut({ sessionId: "sess-dns-1" })).toBe(true);
    expect(await s.doNotSell.isOptedOut({ email: "x@example.com", sessionId: "other" })).toBe(false);
  });

  it("accepts a phone alone and rejects requests with neither, or bad values", async () => {
    const s = m4Setup();
    const deps = () => ({ doNotSell: s.doNotSell, limiter: s.limiter, now: s.now, newId: s.newId });
    expect((await handleDoNotSellPost(postJson("/api/do-not-sell", { phone: "(555) 555-0100" }), deps)).status).toBe(200);
    expect(s.doNotSell.rows[0]).toMatchObject({ email: null, phone: "+15555550100" });
    for (const body of [{ name: "A" }, { email: "nope" }, { phone: "123" }, { email: "a@b.co", state: "California" }]) {
      expect((await handleDoNotSellPost(postJson("/api/do-not-sell", body), deps)).status).toBe(400);
    }
  });
});
