// Request and response contracts for the lead, coverage, email, events and do-not-sell APIs
// (docs/SPEC.md, API contracts and data model). Client-safe: no Node or server imports, so the
// quote form, thanks page and event tracker can import these schemas and types directly.
import { z } from "zod";

// ---------- Buyer mode and coverage ----------

export const BUYER_MODES = ["none", "manual", "service_direct"] as const;
export type BuyerMode = (typeof BUYER_MODES)[number];

export const PRIMARY_CTAS = ["form", "call"] as const;
export type PrimaryCta = (typeof PRIMARY_CTAS)[number];

export const LEAD_TYPES = ["form", "call"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const zipSchema = z.string().trim().regex(/^\d{5}$/, "must be a 5-digit ZIP code");

/** GET /api/coverage?zip= response. leadTypes is ordered primary CTA first. */
export interface CoverageResponse {
  covered: boolean;
  trackingNumber?: string;
  leadTypes: LeadType[];
}

// ---------- Lead intake ----------

/** Timing choices on the quote form (Build decisions, Leads). Ids are stored; labels are shown. */
export const TIMING_OPTIONS = [
  { id: "asap", label: "As soon as possible" },
  { id: "within_3_months", label: "Within 3 months" },
  { id: "3_to_12_months", label: "3–12 months" },
  { id: "just_researching", label: "Just researching" },
] as const;
export type Timing = (typeof TIMING_OPTIONS)[number]["id"];
const TIMING_IDS = TIMING_OPTIONS.map((t) => t.id) as [Timing, ...Timing[]];

/** Estimate IDs are UUIDs (demo estimates, local only, start with "demo-"). */
const estimateIdSchema = z.string().trim().min(1).max(200);

export const leadRequestSchema = z
  .object({
    estimateId: estimateIdSchema,
    name: z.string().trim().min(2, "enter your name").max(100),
    /** Any common US format; normalized to E.164 (+1XXXXXXXXXX) on the server. */
    phone: z.string().trim().min(1).max(32),
    email: z.string().trim().max(254).email("enter a valid email"),
    timing: z.enum(TIMING_IDS),
    /** The service address: pre-filled from the estimate, confirmed or edited by the homeowner. */
    address: z.string().trim().min(5, "enter the street address for the project").max(300),
    /** The version id of the consent text shown next to the checkbox (see CONSENT_TEXTS). */
    consentVersion: z.string().min(1).max(64),
    /** DECISION: the contract adds the checkbox state; it must be true (unchecked by default in the UI). */
    consent: z.literal(true, { message: "consent is required" }),
    /** Certificate ID from a consent-certificate provider (e.g. TrustedForm), if the buyer requires one. */
    consentCertId: z.string().trim().min(1).max(256).optional(),
    /** DECISION: the page URL the form was submitted from; falls back to the Referer header. */
    pageUrl: z.string().url().max(2048).optional(),
    /** Attribution session ID (the pmnr_sid cookie is used when this is absent). */
    sessionId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();
export type LeadRequest = z.input<typeof leadRequestSchema>;

export interface LeadResponse {
  ok: true;
  leadId: string;
  /**
   * DECISION: added to the contract. True when the same phone already asked within 30 days: the
   * request is saved but not forwarded again, and the thanks page says so.
   */
  duplicate: boolean;
}

export type LeadErrorCode =
  | "invalid_request"
  | "invalid_phone"
  | "unknown_consent_version"
  | "estimate_not_found"
  | "not_covered"
  | "rate_limited"
  | "internal_error";

export interface ApiError<C extends string = string> {
  error: C;
  message: string;
  /** For invalid_request: the first failing field. */
  field?: string;
}

// ---------- Email estimate ----------

export const emailEstimateRequestSchema = z
  .object({
    estimateId: estimateIdSchema,
    email: z.string().trim().max(254).email("enter a valid email"),
    notifyWhenCovered: z.boolean(),
  })
  .strict();
export type EmailEstimateRequest = z.input<typeof emailEstimateRequestSchema>;
export interface OkResponse {
  ok: true;
}

// ---------- Events ----------

/** Funnel events in order (docs/SPEC.md, Tracking and attribution). */
export const FUNNEL_EVENTS = [
  "page_view",
  "address_entered",
  "measured",
  "fallback_shown",
  "estimate_shown",
  "explanation_shown",
  "call_click",
  "form_submit",
  "email_estimate",
  "lead_forwarded",
  "call_qualified",
] as const;
export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];

/** Events only the server records (admin forwarding, call webhook); POST /api/events rejects them. */
export const SERVER_ONLY_EVENTS = ["lead_forwarded", "call_qualified"] as const satisfies readonly FunnelEvent[];
export const CLIENT_EVENTS = FUNNEL_EVENTS.filter(
  (e) => !(SERVER_ONLY_EVENTS as readonly string[]).includes(e),
) as Exclude<FunnelEvent, (typeof SERVER_ONLY_EVENTS)[number]>[];
export type ClientEvent = (typeof CLIENT_EVENTS)[number];

export const EVENT_LIMITS = { maxBodyBytes: 4096, maxProps: 20, maxKeyLength: 40, maxStringLength: 300 } as const;

const propValue = z.union([z.string().max(EVENT_LIMITS.maxStringLength), z.number().finite(), z.boolean(), z.null()]);

export const eventRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(128),
    name: z.enum(CLIENT_EVENTS as [ClientEvent, ...ClientEvent[]]),
    props: z
      .record(z.string().min(1).max(EVENT_LIMITS.maxKeyLength).regex(/^[a-zA-Z0-9_]+$/), propValue)
      .refine((p) => Object.keys(p).length <= EVENT_LIMITS.maxProps, `at most ${EVENT_LIMITS.maxProps} props`)
      .default({}),
  })
  .strict();
export type EventRequest = z.input<typeof eventRequestSchema>;

// ---------- California do-not-sell ----------

const DNS_EMAIL = z.string().trim().max(254).email();

/** POST /api/do-not-sell body. Email or phone (or both) identifies the records to opt out. */
export const doNotSellRequestSchema = z
  .object({
    name: z.string().trim().max(200).optional().default(""),
    email: z.string().trim().max(254).optional().default(""),
    phone: z.string().trim().max(40).optional().default(""),
    /** Two-letter state of residence (the form sends "CA"). */
    state: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((s) => s.toUpperCase())
      .optional(),
    requestType: z.enum(["opt_out_sale_share", "limit_sensitive"]).default("opt_out_sale_share"),
    authorizedAgent: z.boolean().default(false),
    details: z.string().trim().max(2000).optional().default(""),
  })
  .strict()
  .refine((v) => v.email.length > 0 || v.phone.length > 0, { message: "email or phone required", path: ["email"] })
  .refine((v) => v.email.length === 0 || DNS_EMAIL.safeParse(v.email).success, { message: "invalid email", path: ["email"] })
  .refine((v) => v.phone.length === 0 || v.phone.replace(/\D/g, "").length >= 10, { message: "invalid phone", path: ["phone"] });
export type DoNotSellRequest = z.input<typeof doNotSellRequestSchema>;

// ---------- Attribution ----------

/** URL params captured on landing and stored in the pmnr_attr cookie (30 days). */
export const ATTRIBUTION_PARAMS = [
  "oppref",
  "ad_group_id",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;
export type AttributionParam = (typeof ATTRIBUTION_PARAMS)[number];
export type Attribution = Partial<Record<AttributionParam, string>> & {
  /** When these params were captured (ISO). */
  capturedAt?: string;
  /** Landing path (no query string). */
  landingPath?: string;
};

export const ATTRIBUTION_COOKIE = "pmnr_attr";
export const SESSION_COOKIE = "pmnr_sid";
/** Set by POST /api/do-not-sell; the pixel stays off and Conversions API events are suppressed. */
export const OPT_OUT_COOKIE = "pmnr_optout";
/** sessionStorage key the UI should mirror attribution into (client-side copy; see lib/attribution). */
export const ATTRIBUTION_STORAGE_KEY = "pmnr_attr";
