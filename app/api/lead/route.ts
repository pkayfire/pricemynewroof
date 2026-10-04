// POST /api/lead: { estimateId, name, phone, email, timing, consentVersion, consent, consentCertId? }
// → { ok, leadId }. Validates, dedupes by phone (30 days), saves with the consent record, routes
// per buyerMode (v1 manual: manual_pending) and alerts the admin. Types: lib/api/contracts.ts.
import { handleLeadPost } from "@/lib/leads/endpoints";
import { leadDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleLeadPost(request, () => leadDeps());
}
