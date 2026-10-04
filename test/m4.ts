// Shared setup for Milestone 4 tests: in-memory stores and a stored estimate.
import { BUYER_CONFIG, type BuyerConfig } from "@/lib/buyer/config";
import { coverageProviderFor } from "@/lib/coverage";
import { MemoryEmailSender } from "@/lib/email";
import { getEstimateView } from "@/lib/estimates/source";
import { MemoryEstimateStore } from "@/lib/estimates/store";
import type { EstimateRecord } from "@/lib/estimates/types";
import { serviceDirectForwarderStub } from "@/lib/leads/forwarder";
import type { LeadDeps } from "@/lib/leads/service";
import { MemoryRateLimiter } from "@/lib/ratelimit";
import { MemoryDoNotSellStore, MemoryEmailSignupStore, MemoryEventStore, MemoryLeadStore } from "@/lib/server/memory-stores";

export const T0 = new Date("2026-10-03T12:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;
export const ESTIMATE_ID = "00000000-0000-4000-8000-000000000001";

export function estimateRecord(over: Partial<EstimateRecord> = {}): EstimateRecord {
  return {
    id: ESTIMATE_ID,
    createdAt: T0.toISOString(),
    expiresAt: new Date(T0.getTime() + 30 * DAY).toISOString(),
    placeId: "P",
    zip: "85032",
    cbsa: "11111",
    state: "AZ",
    formattedAddress: "100 Example Way, Testville, AZ 85032, USA",
    measurements: null,
    needsFallback: false,
    fallbackReason: null,
    currentRoof: "tile",
    options: [{ id: "architectural_shingle", name: "Architectural shingle", low: 12000, high: 18500, note: null }],
    drivers: {
      squares: 20.4,
      sections: 9,
      complexity: "average",
      steepShare: 0.3,
      maxPitch: "8/12",
      areaName: "Sample Metro",
      wageSource: "metro",
      laborVsNational: -0.08,
      materialTrendSinceBase: 0.03,
      sharesOption: "architectural_shingle",
      shares: { labor: 0.59, materials: 0.2, other: 0.21 },
      confidence: "high",
      fallbacks: [],
    },
    configVersion: 2,
    sessionId: "sess-estimate-1",
    client: "web",
    ...over,
  };
}

export function m4Setup(buyer: Partial<BuyerConfig> = {}) {
  let clock = T0;
  let n = 0;
  const now = () => clock;
  const estimates = new MemoryEstimateStore();
  const leads = new MemoryLeadStore();
  const events = new MemoryEventStore();
  const signups = new MemoryEmailSignupStore();
  const doNotSell = new MemoryDoNotSellStore();
  const email = new MemoryEmailSender();
  const limiter = new MemoryRateLimiter(now);
  const buyerConfig: BuyerConfig = { ...BUYER_CONFIG, ...buyer };
  const newId = () => `10000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const coverage = coverageProviderFor(buyerConfig);
  const getEstimate = (id: string) => getEstimateView(id, { store: () => estimates, coverage, demos: () => null });
  const leadDeps: LeadDeps & { limiter: MemoryRateLimiter } = {
    getEstimate,
    leads,
    doNotSell,
    coverage,
    buyer: buyerConfig,
    email,
    forwarder: serviceDirectForwarderStub,
    now,
    newId,
    siteUrl: "https://example.test",
    adminEmail: "admin@example.test",
    limiter,
  };
  return {
    estimates,
    getEstimate,
    leads,
    events,
    signups,
    doNotSell,
    email,
    limiter,
    leadDeps,
    now,
    newId,
    setNow: (d: Date) => (clock = d),
  };
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://example.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export function dnsRecord(over: Partial<import("@/lib/server/stores").DoNotSellRecord> = {}): import("@/lib/server/stores").DoNotSellRecord {
  return {
    id: "d",
    createdAt: T0.toISOString(),
    email: null,
    phone: null,
    name: null,
    state: "CA",
    requestType: "opt_out_sale_share",
    authorizedAgent: false,
    details: null,
    ipHash: null,
    sessionId: null,
    ...over,
  };
}
