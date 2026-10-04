import { describe, expect, it } from "vitest";
import { handleEstimatePost } from "@/lib/estimates/http";
import type { EstimateDeps } from "@/lib/estimates/service";
import { enforceLimit, LIMITS, limitKey, MemoryRateLimiter, type RateLimiter } from "@/lib/ratelimit";

const T0 = new Date("2026-10-03T12:10:00.000Z");

function clock(start = T0) {
  let t = start.getTime();
  return { now: () => new Date(t), advance: (ms: number) => (t += ms) };
}

describe("rate limiter", () => {
  it("allows up to the limit in a window, then blocks", async () => {
    const c = clock();
    const rl = new MemoryRateLimiter(c.now);
    for (let i = 1; i <= 3; i++) expect((await rl.hit("b", "k", 3, 3600)).allowed).toBe(true);
    const over = await rl.hit("b", "k", 3, 3600);
    expect(over).toMatchObject({ allowed: false, hits: 4 });
    expect(over.resetAt.toISOString()).toBe("2026-10-03T13:00:00.000Z");
    // Other keys and buckets are independent.
    expect((await rl.hit("b", "k2", 3, 3600)).allowed).toBe(true);
    expect((await rl.hit("b2", "k", 3, 3600)).allowed).toBe(true);
  });

  it("resets when the window rolls over", async () => {
    const c = clock();
    const rl = new MemoryRateLimiter(c.now);
    for (let i = 0; i < 4; i++) await rl.hit("b", "k", 3, 3600);
    c.advance(50 * 60 * 1000); // 13:00
    expect(await rl.hit("b", "k", 3, 3600)).toMatchObject({ allowed: true, hits: 1 });
  });

  it("returns 429 with Retry-After when the IP or the session is over", async () => {
    const c = clock();
    const rl = new MemoryRateLimiter(c.now);
    const rule = { bucket: "t", limit: 2, windowSeconds: 3600 };
    expect(await enforceLimit(rl, rule, { ip: "1.2.3.4", sessionId: "s" }, c.now)).toBeNull();
    expect(await enforceLimit(rl, rule, { ip: "1.2.3.4", sessionId: "s" }, c.now)).toBeNull();
    // Same session from a new IP is still limited by the session.
    const res = await enforceLimit(rl, rule, { ip: "5.6.7.8", sessionId: "s" }, c.now);
    expect(res?.status).toBe(429);
    expect(res?.headers.get("retry-after")).toBe(String(50 * 60));
    expect(await res?.json()).toMatchObject({ error: "rate_limited" });
  });

  it("hashes keys so raw IPs are never stored, and fails open on limiter errors", async () => {
    expect(limitKey("ip", "1.2.3.4")).toMatch(/^[0-9a-f]{64}$/);
    expect(limitKey("ip", "1.2.3.4")).not.toContain("1.2.3.4");
    const broken: RateLimiter = { hit: async () => Promise.reject(new Error("db down")) };
    expect(await enforceLimit(broken, LIMITS.estimate, { ip: "1.2.3.4" })).toBeNull();
  });

  it("POST /api/estimate is limited to 500 per hour per IP", async () => {
    expect(LIMITS.estimate).toEqual({ bucket: "estimate", limit: 500, windowSeconds: 3600 });
    const c = clock();
    const rl = new MemoryRateLimiter(c.now);
    for (let i = 0; i < 500; i++) await rl.hit("estimate", limitKey("ip", "9.9.9.9"), 500, 3600);
    let called = false;
    const deps = () => {
      called = true;
      return {} as EstimateDeps;
    };
    const req = new Request("https://x.test/api/estimate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
      body: JSON.stringify({ placeId: "P" }),
    });
    const res = await handleEstimatePost(req, deps, { limiter: rl, now: c.now });
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBe(50 * 60);
    expect(called).toBe(false);
  });
});
