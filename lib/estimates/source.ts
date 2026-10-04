// SEAM: where the frontend gets estimates.
//
// Before Milestone 2 merges, estimates come from a local in-memory mock store seeded with
// synthetic demo fixtures, and POST /api/estimate (app/api/estimate/route.ts) is a mock that
// writes to it. At merge:
//   - getStoredEstimate() reads Milestone 2's EstimateStore (Supabase `estimates` row) instead;
//   - app/api/estimate/route.ts is replaced by Milestone 2's real handler;
//   - createMockEstimate() and this module's in-memory map are deleted.
// Nothing else in the frontend needs to change.
import type { EstimateRequest, EstimateResponse, StoredEstimate } from "@/lib/api/types";
import { DEMO_ESTIMATES } from "./demo-fixtures";

const store = new Map<string, StoredEstimate>(DEMO_ESTIMATES.map((e) => [e.estimateId, e]));

/** Load an estimate for /estimate/[id] and GET /api/explanation/[id]. */
export async function getStoredEstimate(id: string): Promise<StoredEstimate | null> {
  return store.get(id) ?? null;
}

/** Solar-derived measurements and the address are purged at 30 days (Build decisions). */
export function isExpired(estimate: StoredEstimate, now: Date = new Date()): boolean {
  if (estimate.needsFallback) return false;
  return estimate.measurements === null || now.getTime() > Date.parse(estimate.expiresAt);
}

export function toResponse(e: StoredEstimate): EstimateResponse {
  return {
    estimateId: e.estimateId,
    needsFallback: e.needsFallback,
    ...(e.reason ? { reason: e.reason } : {}),
    measurements: e.measurements,
    options: e.options,
    drivers: e.drivers,
    configVersion: e.configVersion,
    coverage: e.coverage,
  };
}

/**
 * MOCK of POST /api/estimate for local development only. It doesn't price anything: it picks a
 * demo estimate and stores a copy under a new id. Placeholder place IDs:
 *   "demo-not-found" → null (the route answers 422, "address not found")
 *   any place with `fallback` → the home-size demo
 *   "demo-place-fallback" without `fallback` → the needs-fallback demo
 *   a demo place ID → that demo; any other (real Google) place ID → the covered demo
 */
export async function createMockEstimate(req: EstimateRequest): Promise<StoredEstimate | null> {
  if (req.placeId === "demo-not-found") return null;
  let base: StoredEstimate;
  if (req.fallback) {
    const homeSize = DEMO_ESTIMATES.find((e) => e.estimateId === "demo-home-size")!;
    base = {
      ...homeSize,
      measurements: homeSize.measurements && { ...homeSize.measurements, homeSize: req.fallback },
    };
  } else {
    base =
      DEMO_ESTIMATES.find((e) => e.placeId === req.placeId && e.estimateId !== "demo-expired" && e.estimateId !== "demo-home-size") ??
      DEMO_ESTIMATES.find((e) => e.estimateId === "demo-covered")!;
  }
  const now = new Date();
  const copy: StoredEstimate = {
    ...base,
    placeId: req.placeId,
    estimateId: `mock-${crypto.randomUUID()}`,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
    currentRoof: req.currentRoof ?? base.currentRoof,
  };
  store.set(copy.estimateId, copy);
  return copy;
}
