// POST /api/estimate: { placeId, currentRoof?, fallback?, client? } →
// { estimateId, needsFallback, measurements, options[], drivers, configVersion, coverage, … }.
// Works from a plain HTTP client; no browser session or cookie is required.
import { productionDeps } from "@/lib/estimates/deps";
import { handleEstimatePost } from "@/lib/estimates/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleEstimatePost(request, () => productionDeps());
}
