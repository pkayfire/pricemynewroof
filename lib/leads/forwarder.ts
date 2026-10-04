// Lead forwarding per buyerMode (docs/SPEC.md, Lead intake step 4).
import type { BuyerMode } from "@/lib/api/contracts";
import type { ForwardStatus, LeadRecord } from "@/lib/server/stores";

export interface ForwardResult {
  status: Extract<ForwardStatus, "queued" | "failed" | "forwarded">;
  buyerRef?: string;
}

/** Delivers a lead to an automated buyer (service_direct mode). */
export interface LeadForwarder {
  forward(lead: LeadRecord): Promise<ForwardResult>;
}

/**
 * STUB (Service Direct): nothing is sent. The real forwarder posts to Service Direct's lead API
 * (method and fields pending their answers) with exponential backoff up to 24 hours via the
 * lead-retry cron, alerting after 3 consecutive failures. Until then leads are saved as "queued".
 */
export const serviceDirectForwarderStub: LeadForwarder = {
  async forward() {
    return { status: "queued" };
  },
};

/** Initial status for modes without an automated buyer. */
export function initialForwardStatus(mode: Exclude<BuyerMode, "service_direct">): ForwardStatus {
  return mode === "manual" ? "manual_pending" : "held";
}
