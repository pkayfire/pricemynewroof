// Where the frontend reads estimates: Milestone 2's EstimateStore (Supabase in production, in
// memory locally without a service role key). Server only.
//
// Demo estimates (synthetic, for local screenshots) are served only when NODE_ENV is not
// "production" and DEMO_ESTIMATES=1; they are never reachable in production.
import { stubCoverage, type CoverageProvider } from "./coverage";
import { getEstimateStore } from "./deps";
import type { EstimateStore } from "./store";
import { toEstimateView, type EstimateView } from "./view";

export { isExpired, type EstimateView } from "./view";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function demoEstimatesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.DEMO_ESTIMATES === "1";
}

export interface EstimateSourceDeps {
  store: () => EstimateStore;
  // MERGE NOTE (Milestone 4): swap the stub for the launch-allowlist coverage provider.
  coverage: CoverageProvider;
  demos: () => Promise<Map<string, EstimateView>> | null;
}

const defaultDeps: EstimateSourceDeps = {
  store: () => getEstimateStore(),
  coverage: stubCoverage,
  demos: () => (demoEstimatesEnabled() ? import("./demo-fixtures").then((m) => m.demoEstimateViews()) : null),
};

/** The estimate for /estimate/[id] and GET /api/explanation/[id], or null if there is none. */
export async function getEstimateView(id: string, deps: EstimateSourceDeps = defaultDeps): Promise<EstimateView | null> {
  if (id.startsWith("demo-")) {
    const demos = await deps.demos();
    return demos?.get(id) ?? null;
  }
  if (!UUID_RE.test(id)) return null; // estimate IDs are UUIDs; don't send anything else to the database
  const record = await deps.store().get(id);
  if (!record) return null;
  return toEstimateView(record, await deps.coverage.forZip(record.zip));
}
