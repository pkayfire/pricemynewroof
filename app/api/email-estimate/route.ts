// POST /api/email-estimate: { estimateId, email, notifyWhenCovered } → { ok }.
import { handleEmailEstimatePost } from "@/lib/leads/endpoints";
import { emailEstimateDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleEmailEstimatePost(request, () => emailEstimateDeps());
}
