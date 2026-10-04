// Storage interfaces for leads, events, email signups and do-not-sell requests. In-memory
// implementations (memory-stores.ts) serve tests and local runs; Supabase (supabase-stores.ts)
// serves production with the service role key.
import type { Attribution, FunnelEvent, Timing } from "@/lib/api/contracts";
import type { CurrentRoof } from "@/lib/engine/types";

export const FORWARD_STATUSES = ["manual_pending", "held", "duplicate", "queued", "failed", "forwarded"] as const;
export type ForwardStatus = (typeof FORWARD_STATUSES)[number];

/** Measurements attached for the buyer (spec: squares, pitch, current roof). */
export interface EstimateSummary {
  squares: number | null;
  maxPitch: string | null;
  currentRoof: CurrentRoof | null;
}

export type StoredAttribution = Attribution & { obref?: string };

export interface LeadRecord {
  id: string;
  createdAt: string;
  estimateId: string;
  name: string;
  /** E.164 (+1XXXXXXXXXX). */
  phone: string;
  email: string;
  timing: Timing;
  zip: string;
  state: string;
  consentVersion: string;
  /** SHA-256 (hex) of the exact consent text shown. */
  consentTextHash: string;
  consentTs: string;
  consentCertId: string | null;
  ip: string | null;
  userAgent: string | null;
  pageUrl: string | null;
  estimateSummary: EstimateSummary | null;
  attribution: StoredAttribution;
  sessionId: string | null;
  /** Do-not-sell or Global Privacy Control: no Conversions API events for this lead. */
  optOut: boolean;
  forwardStatus: ForwardStatus;
  forwardedAt: string | null;
  buyerRef: string | null;
  /** For duplicates: the original lead (same phone within 30 days). */
  duplicateOf: string | null;
}

/** A lead with its estimate's address (available until the 30-day purge) for the admin view. */
export type AdminLead = LeadRecord & { address: string | null };

export interface LeadStore {
  insert(lead: LeadRecord): Promise<void>;
  get(id: string): Promise<LeadRecord | null>;
  /** The newest lead with this phone created at or after `since`. */
  findRecentByPhone(phone: string, since: Date): Promise<LeadRecord | null>;
  /** Newest first. */
  list(limit: number): Promise<AdminLead[]>;
  /** Sets forward_status = forwarded unless already forwarded; returns the updated row, or null if missing. */
  markForwarded(id: string, at: Date, buyerRef: string | null): Promise<{ lead: LeadRecord; changed: boolean } | null>;
}

export interface EventRecord {
  sessionId: string | null;
  name: FunnelEvent;
  ts: string;
  source: "client" | "server";
  attribution: Attribution;
  props: Record<string, string | number | boolean | null>;
}

export interface EventStore {
  append(event: EventRecord): Promise<void>;
}

export interface EmailSignupRecord {
  id: string;
  createdAt: string;
  estimateId: string;
  email: string;
  notifyWhenCovered: boolean;
  consentTs: string;
  sessionId: string | null;
  attribution: Attribution;
}

export interface EmailSignupStore {
  insert(signup: EmailSignupRecord): Promise<void>;
}

export interface DoNotSellRecord {
  id: string;
  createdAt: string;
  /** Lowercased. */
  email: string;
  name: string | null;
  state: string;
  ipHash: string | null;
  sessionId: string | null;
}

export interface DoNotSellStore {
  insert(record: DoNotSellRecord): Promise<void>;
  /** True if a request exists for this email (case-insensitive) or session. */
  isOptedOut(by: { email?: string | null; sessionId?: string | null }): Promise<boolean>;
}
