// POST /api/estimate: { placeId, currentRoof?, fallback?, client? } →
// { estimateId, needsFallback, measurements, options[], drivers, configVersion, coverage, … }.
// Works from a plain HTTP client; no browser session or cookie is required.
// Limited to 500 requests per hour per IP and per session (429 with Retry-After).
import { productionDeps } from "@/lib/estimates/deps";
import { handleEstimatePost } from "@/lib/estimates/http";
import { getRateLimiter } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleEstimatePost(request, () => productionDeps(), { limiter: getRateLimiter() });
}
