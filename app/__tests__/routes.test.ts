import { beforeAll, describe, expect, it, vi } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";
import { POST as doNotSell } from "../api/do-not-sell/route";
import { POST as emailEstimate } from "../api/email-estimate/route";
import { GET as explanation } from "../api/explanation/[id]/route";

// Demo estimates stand in for stored ones (served outside production with DEMO_ESTIMATES=1).
beforeAll(() => {
  vi.stubEnv("DEMO_ESTIMATES", "1");
});

const post = (body: unknown) =>
  new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("robots and sitemap", () => {
  it("allows OpenAI crawlers and blocks estimate and admin pages", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const oai = rules.find((x) => Array.isArray(x.userAgent) && x.userAgent.includes("OAI-AdsBot"));
    expect(oai?.userAgent).toEqual(["OAI-AdsBot", "OAI-SearchBot"]);
    for (const rule of rules) {
      expect(rule.allow).toBe("/");
      expect(rule.disallow).toEqual(["/estimate/", "/admin/"]);
    }
  });

  it("lists public pages only", () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    expect(urls).toEqual(["/", "/how-we-estimate", "/privacy", "/terms", "/do-not-sell"]);
    expect(urls.some((u) => u.startsWith("/estimate"))).toBe(false);
  });
});

describe("POST /api/do-not-sell (stub)", () => {
  it("accepts an email or phone and rejects requests with neither", async () => {
    expect((await doNotSell(post({ email: "a@example.com" }))).status).toBe(200);
    expect((await doNotSell(post({ phone: "(555) 555-0100" }))).status).toBe(200);
    expect((await doNotSell(post({ name: "A" }))).status).toBe(400);
    expect((await doNotSell(post({ email: "nope" }))).status).toBe(400);
    expect((await doNotSell(post("{"))).status).toBe(400);
  });
});

describe("POST /api/email-estimate (stub)", () => {
  it("validates the body and the estimate", async () => {
    const ok = await emailEstimate(post({ estimateId: "demo-no-coverage", email: "a@example.com", notifyWhenCovered: true }));
    expect(await ok.json()).toEqual({ ok: true });
    expect(
      (await emailEstimate(post({ estimateId: "demo-no-coverage", email: "bad", notifyWhenCovered: false }))).status,
    ).toBe(400);
    expect(
      (await emailEstimate(post({ estimateId: "missing", email: "a@example.com", notifyWhenCovered: false }))).status,
    ).toBe(404);
  });
});

describe("GET /api/explanation/[id]", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it("404s for unknown, expired and needs-fallback estimates", async () => {
    for (const id of ["missing", "demo-expired", "demo-needs-fallback"]) {
      expect((await explanation(new Request("http://localhost"), ctx(id))).status).toBe(404);
    }
  });
});
