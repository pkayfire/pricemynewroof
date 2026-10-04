// POST /api/lead (docs/SPEC.md, Coverage, leads and calls → Lead intake).
import { consentFor, type ConsentText } from "@/lib/api/consent";
import { leadRequestSchema, type ApiError, type LeadErrorCode, type LeadResponse } from "@/lib/api/contracts";
import { attributionForStorage, type RequestContext } from "@/lib/attribution";
import type { BuyerConfig } from "@/lib/buyer/config";
import type { CoverageProvider } from "@/lib/coverage";
import type { EmailSender } from "@/lib/email";
import { leadAlertEmail } from "@/lib/email/templates";
import type { EstimateView } from "@/lib/estimates/view";
import { invalidRequest } from "@/lib/http/request";
import { sha256Hex } from "@/lib/server/hash";
import type { DoNotSellStore, LeadRecord, LeadStore } from "@/lib/server/stores";
import { initialForwardStatus, type LeadForwarder } from "./forwarder";
import { toE164US } from "./phone";

export const DEDUPE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface LeadDeps {
  /** The estimate as the page shows it (lib/estimates/source.ts getEstimateView). */
  getEstimate(id: string): Promise<EstimateView | null>;
  leads: LeadStore;
  doNotSell: DoNotSellStore;
  coverage: CoverageProvider;
  buyer: BuyerConfig;
  email: EmailSender;
  /** Used in service_direct mode only. */
  forwarder: LeadForwarder;
  now(): Date;
  newId(): string;
  siteUrl: string;
  /** Recipient of new-lead alerts. */
  adminEmail: string;
  /** Consent text for a buyer mode (default: consentFor). */
  consentFor?: (mode: LeadDeps["buyer"]["buyerMode"]) => ConsentText | null;
}

export type LeadResult =
  | { status: 200; body: LeadResponse }
  | { status: 400 | 404 | 422 | 503; body: ApiError<LeadErrorCode | "consent_unavailable"> };

export async function handleLead(raw: unknown, ctx: RequestContext, deps: LeadDeps): Promise<LeadResult> {
  const parsed = leadRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: 400, body: invalidRequest(parsed.error.issues) };
  const req = parsed.data;

  const phone = toE164US(req.phone);
  if (!phone) return { status: 400, body: { error: "invalid_phone", message: "Enter a valid US phone number.", field: "phone" } };

  // The consent text must be the one for the active mode (it describes what happens to the request).
  const consent = (deps.consentFor ?? consentFor)(deps.buyer.buyerMode);
  if (!consent) return { status: 503, body: { error: "consent_unavailable", message: "Quote requests are not available right now." } };
  if (req.consentVersion !== consent.version) {
    return { status: 400, body: { error: "unknown_consent_version", message: "Reload the page and try again.", field: "consentVersion" } };
  }

  const estimate = await deps.getEstimate(req.estimateId);
  if (!estimate) return { status: 404, body: { error: "estimate_not_found", message: "Estimate not found." } };
  const coverage = await deps.coverage.forZip(estimate.zip);
  if (!coverage.covered || !coverage.leadTypes.includes("form")) {
    return { status: 422, body: { error: "not_covered", message: "We don't have partner roofers in this area yet." } };
  }

  const now = deps.now();
  const email = req.email.trim();
  const sessionId = req.sessionId ?? ctx.sessionId;
  const optOut = ctx.optedOut || (await deps.doNotSell.isOptedOut({ email, phone, sessionId }));
  // Dedupe: same phone within 30 days is accepted but never forwarded again.
  const prior = await deps.leads.findRecentByPhone(phone, new Date(now.getTime() - DEDUPE_DAYS * DAY_MS));

  const lead: LeadRecord = {
    id: deps.newId(),
    createdAt: now.toISOString(),
    estimateId: estimate.estimateId,
    name: req.name,
    phone,
    email,
    timing: req.timing,
    address: req.address,
    zip: estimate.zip,
    state: estimate.state,
    consentVersion: consent.version,
    consentTextHash: sha256Hex(consent.text),
    consentTs: now.toISOString(),
    consentCertId: req.consentCertId ?? null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    pageUrl: req.pageUrl ?? ctx.referer,
    estimateSummary: {
      squares: estimate.drivers?.squares ?? null,
      maxPitch: estimate.drivers?.maxPitch ?? null,
      currentRoof: estimate.currentRoof,
    },
    attribution: attributionForStorage(ctx),
    sessionId,
    optOut,
    forwardStatus: "duplicate",
    forwardedAt: null,
    buyerRef: null,
    duplicateOf: prior ? (prior.duplicateOf ?? prior.id) : null,
  };

  if (!prior) {
    if (deps.buyer.buyerMode === "service_direct") {
      const result = await deps.forwarder.forward(lead);
      lead.forwardStatus = result.status;
      lead.buyerRef = result.buyerRef ?? null;
      if (result.status === "forwarded") lead.forwardedAt = now.toISOString();
    } else {
      lead.forwardStatus = initialForwardStatus(deps.buyer.buyerMode);
    }
  }
  await deps.leads.insert(lead);

  // DECISION: duplicates get no alert (they are not new leads and are never re-forwarded).
  if (!prior) {
    try {
      await deps.email.send(
        leadAlertEmail({ to: deps.adminEmail, leadId: lead.id, zip: lead.zip, timing: lead.timing, status: lead.forwardStatus, siteUrl: deps.siteUrl }),
      );
    } catch (e) {
      // The lead is saved; a failed alert must not fail the request.
      console.error("[lead] alert email failed:", (e as Error).message);
    }
  }
  return { status: 200, body: { ok: true, leadId: lead.id } };
}
