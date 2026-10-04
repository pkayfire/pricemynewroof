import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { attributionFromUrl, decodeAttribution, encodeAttribution, requestContext } from "@/lib/attribution";
import { clientIp, parseCookies } from "@/lib/http/request";
import { hasGpc, isOptedOut } from "@/lib/privacy/opt-out";
import { proxy } from "@/proxy";

const T = new Date("2026-10-03T12:00:00.000Z");

describe("attribution", () => {
  it("captures oppref, ad_group_id and UTM params from a landing URL", () => {
    const a = attributionFromUrl(new URL("https://x.test/?oppref=opp%201&ad_group_id=ag-7&utm_source=chatgpt&utm_campaign=roof&other=1"), T);
    expect(a).toEqual({ oppref: "opp 1", ad_group_id: "ag-7", utm_source: "chatgpt", utm_campaign: "roof", capturedAt: T.toISOString(), landingPath: "/" });
    expect(attributionFromUrl(new URL("https://x.test/?q=1"), T)).toBeNull();
    expect(attributionFromUrl(new URL("https://x.test/?oppref="), T)).toBeNull();
  });

  it("round-trips through the cookie and ignores junk", () => {
    const a = { oppref: "o", ad_group_id: "g" };
    expect(decodeAttribution(decodeURIComponent(encodeAttribution(a)))).toEqual(a);
    expect(decodeAttribution("not json")).toEqual({});
    expect(decodeAttribution(JSON.stringify({ oppref: 5, evil: "x", utm_source: "s" }))).toEqual({ utm_source: "s" });
    expect(decodeAttribution(JSON.stringify({ oppref: "x".repeat(500) })).oppref).toHaveLength(200);
  });

  it("builds a request context from cookies and headers", () => {
    const req = new Request("https://x.test/api/lead", {
      headers: {
        cookie: `pmnr_sid=abcdef12-3456; pmnr_attr=${encodeAttribution({ oppref: "o" })}; __obref=ob`,
        "x-forwarded-for": "198.51.100.2, 10.0.0.1",
        "user-agent": "UA",
      },
    });
    expect(requestContext(req, clientIp(req))).toEqual({
      ip: "198.51.100.2",
      userAgent: "UA",
      referer: null,
      sessionId: "abcdef12-3456",
      attribution: { oppref: "o" },
      obref: "ob",
      optedOut: false,
    });
    const badSid = new Request("https://x.test", { headers: { cookie: "pmnr_sid=<script>" } });
    expect(requestContext(badSid, null).sessionId).toBeNull();
  });

  it("parses cookies defensively", () => {
    expect(parseCookies("a=1; b=%E0%A4%A; =x; c")).toEqual({ a: "1", b: "%E0%A4%A" });
  });
});

describe("Global Privacy Control and do-not-sell", () => {
  it("treats Sec-GPC: 1 or the pmnr_optout cookie as opted out", () => {
    expect(hasGpc(new Headers({ "sec-gpc": "1" }))).toBe(true);
    expect(hasGpc(new Headers({ "sec-gpc": "0" }))).toBe(false);
    expect(isOptedOut(new Headers(), { pmnr_optout: "1" })).toBe(true);
    expect(isOptedOut(new Headers(), {})).toBe(false);
    expect(requestContext(new Request("https://x.test", { headers: { "Sec-GPC": "1" } }), null).optedOut).toBe(true);
    expect(requestContext(new Request("https://x.test", { headers: { cookie: "pmnr_optout=1" } }), null).optedOut).toBe(true);
  });
});

describe("proxy", () => {
  const setCookies = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0].split("=")[0]);

  it("stores attribution for 30 days and assigns a session ID on landing", async () => {
    const res = await proxy(new NextRequest("https://pricemynewroof.com/?oppref=o1&ad_group_id=ag"));
    const cookies = res.headers.getSetCookie();
    expect(setCookies(res).sort()).toEqual(["pmnr_attr", "pmnr_sid"]);
    const attr = cookies.find((c) => c.startsWith("pmnr_attr="))!;
    expect(attr).toMatch(/Max-Age=2592000/);
    expect(attr).toMatch(/SameSite=lax/i);
    expect(attr).toMatch(/Secure/);
    // Single URI encoding: parseCookies (one decode) yields the JSON.
    const value = attr.split(";")[0].slice("pmnr_attr=".length);
    expect(JSON.parse(decodeURIComponent(value))).toMatchObject({ oppref: "o1", ad_group_id: "ag" });
    expect(cookies.find((c) => c.startsWith("pmnr_sid="))).toMatch(/Max-Age=1800/);
  });

  it("rolls the session: the same ID gets a fresh 30-minute expiry; attribution is untouched without params", async () => {
    const res = await proxy(new NextRequest("https://pricemynewroof.com/how-we-estimate", { headers: { cookie: "pmnr_sid=abcdef12-3456", "user-agent": "OAI-AdsBot/1.0" } }));
    expect(res.status).toBe(200);
    const cookies = res.headers.getSetCookie();
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toMatch(/^pmnr_sid=abcdef12-3456;.*Max-Age=1800/);
  });

  it("refreshes the session on API calls but never captures attribution there", async () => {
    const res = await proxy(new NextRequest("https://pricemynewroof.com/api/events?oppref=x", { method: "POST", headers: { cookie: "pmnr_sid=abcdef12-3456" } }));
    expect(setCookies(res)).toEqual(["pmnr_sid"]);
  });

  it("never blocks or redirects crawlers", async () => {
    const bot = await proxy(new NextRequest("https://pricemynewroof.com/", { headers: { "user-agent": "OAI-AdsBot/1.0" } }));
    expect(bot.status).toBe(200);
    expect(bot.headers.get("location")).toBeNull();
  });

  it("marks admin pages noindex and works without the anon key", async () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const res = await proxy(new NextRequest("https://pricemynewroof.com/admin/leads"));
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.getSetCookie()).toEqual([]);
    if (prev !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prev;
  });
});
