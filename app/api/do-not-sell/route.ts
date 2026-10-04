// POST /api/do-not-sell: { email, name?, state } → { ok }. Records a California opt-out and sets
// the pmnr_optout cookie (no OpenAI Pixel or Conversions API events for this person).
import { handleDoNotSellPost } from "@/lib/leads/endpoints";
import { doNotSellDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleDoNotSellPost(request, () => doNotSellDeps());
}
