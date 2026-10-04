// POST /api/admin/leads/[id]/forwarded: Peter forwarded the lead by hand (manual mode). Sets
// forward_status and forwarded_at, records a lead_forwarded event and, unless the person opted
// out, sends a custom lead_forwarded event to the OpenAI Conversions API (lead_created was sent
// when the request was submitted).
import type { ConversionOutcome, ConversionsClient } from "@/lib/openai-ads/capi";
import type { DoNotSellStore, EventStore, LeadRecord, LeadStore } from "@/lib/server/stores";

export interface MarkForwardedDeps {
  leads: LeadStore;
  events: EventStore;
  doNotSell: DoNotSellStore;
  conversions: ConversionsClient;
  now(): Date;
  siteUrl: string;
}

export type MarkForwardedResult =
  | { status: 200; lead: LeadRecord; changed: boolean; conversion: ConversionOutcome | null }
  | { status: 404 };

export async function markLeadForwarded(id: string, buyerRef: string | null, deps: MarkForwardedDeps): Promise<MarkForwardedResult> {
  const now = deps.now();
  const res = await deps.leads.markForwarded(id, now, buyerRef);
  if (!res) return { status: 404 };
  // Already forwarded: idempotent, no second event or conversion.
  if (!res.changed) return { status: 200, lead: res.lead, changed: false, conversion: null };
  const lead = res.lead;

  try {
    await deps.events.append({
      sessionId: lead.sessionId,
      name: "lead_forwarded",
      ts: now.toISOString(),
      source: "server",
      attribution: lead.attribution,
      props: { lead_id: lead.id, zip: lead.zip },
    });
  } catch (e) {
    console.error("[lead] lead_forwarded event failed:", (e as Error).message);
  }

  // Re-check opt-outs at send time: a do-not-sell request may have arrived after the lead.
  let optedOut = lead.optOut;
  if (!optedOut && deps.conversions.enabled) {
    try {
      optedOut = await deps.doNotSell.isOptedOut({ email: lead.email, phone: lead.phone, sessionId: lead.sessionId });
    } catch {
      optedOut = true; // when unsure, don't send
    }
  }
  const conversion = await deps.conversions.send({
    kind: "lead_forwarded",
    id: `lead_forwarded_${lead.id}`,
    at: now,
    sourceUrl: lead.pageUrl || `${deps.siteUrl.replace(/\/+$/, "")}/estimate/${lead.estimateId}/quote`,
    email: lead.email,
    phone: lead.phone,
    oppref: lead.attribution.oppref ?? null,
    obref: lead.attribution.obref ?? null,
    optedOut,
  });
  return { status: 200, lead, changed: true, conversion };
}
