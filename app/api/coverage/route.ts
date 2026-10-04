// GET /api/coverage?zip= → { covered, trackingNumber?, leadTypes[] } per buyerMode.
import { buyerConfigFromEnv } from "@/lib/buyer/config";
import { coverageProviderFor } from "@/lib/coverage";
import { handleCoverageGet } from "@/lib/coverage/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleCoverageGet(request, coverageProviderFor(buyerConfigFromEnv()));
}
