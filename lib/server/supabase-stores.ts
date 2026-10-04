// Supabase implementations of the Milestone 4 stores. Server only (service role key).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Timing } from "@/lib/api/contracts";
import type {
  AdminLead,
  DoNotSellRecord,
  DoNotSellStore,
  EmailSignupRecord,
  EmailSignupStore,
  EstimateSummary,
  EventRecord,
  EventStore,
  ForwardStatus,
  LeadRecord,
  LeadStore,
  OptOutLookup,
  StoredAttribution,
} from "./stores";

/** Row shape of public.leads (supabase/migrations/*_leads.sql). */
export interface LeadRow {
  id: string;
  created_at: string;
  estimate_id: string;
  name: string;
  phone: string;
  email: string;
  timing: string;
  address: string;
  zip: string;
  state: string;
  consent_version: string;
  consent_text_hash: string;
  consent_ts: string;
  consent_cert_id: string | null;
  ip: string | null;
  user_agent: string | null;
  page_url: string | null;
  estimate_summary_json: EstimateSummary | null;
  attribution_json: StoredAttribution;
  session_id: string | null;
  opt_out: boolean;
  forward_status: string;
  forwarded_at: string | null;
  buyer_ref: string | null;
  duplicate_of: string | null;
}

const iso = (s: string | null) => (s === null ? null : new Date(s).toISOString());

export function leadToRow(l: LeadRecord): LeadRow {
  return {
    id: l.id,
    created_at: l.createdAt,
    estimate_id: l.estimateId,
    name: l.name,
    phone: l.phone,
    email: l.email,
    timing: l.timing,
    address: l.address,
    zip: l.zip,
    state: l.state,
    consent_version: l.consentVersion,
    consent_text_hash: l.consentTextHash,
    consent_ts: l.consentTs,
    consent_cert_id: l.consentCertId,
    ip: l.ip,
    user_agent: l.userAgent,
    page_url: l.pageUrl,
    estimate_summary_json: l.estimateSummary,
    attribution_json: l.attribution,
    session_id: l.sessionId,
    opt_out: l.optOut,
    forward_status: l.forwardStatus,
    forwarded_at: l.forwardedAt,
    buyer_ref: l.buyerRef,
    duplicate_of: l.duplicateOf,
  };
}

export function leadFromRow(r: LeadRow): LeadRecord {
  return {
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    estimateId: r.estimate_id,
    name: r.name,
    phone: r.phone,
    email: r.email,
    timing: r.timing as Timing,
    address: r.address,
    zip: r.zip,
    state: r.state,
    consentVersion: r.consent_version,
    consentTextHash: r.consent_text_hash,
    consentTs: new Date(r.consent_ts).toISOString(),
    consentCertId: r.consent_cert_id,
    ip: r.ip,
    userAgent: r.user_agent,
    pageUrl: r.page_url,
    estimateSummary: r.estimate_summary_json,
    attribution: r.attribution_json ?? {},
    sessionId: r.session_id,
    optOut: r.opt_out,
    forwardStatus: r.forward_status as ForwardStatus,
    forwardedAt: iso(r.forwarded_at),
    buyerRef: r.buyer_ref,
    duplicateOf: r.duplicate_of,
  };
}

export class SupabaseLeadStore implements LeadStore {
  constructor(private readonly db: SupabaseClient) {}

  async insert(lead: LeadRecord) {
    const { error } = await this.db.from("leads").insert(leadToRow(lead));
    if (error) throw new Error(`leads insert failed: ${error.message}`);
  }

  async get(id: string) {
    const { data, error } = await this.db.from("leads").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`leads get failed: ${error.message}`);
    return data ? leadFromRow(data as LeadRow) : null;
  }

  async findRecentByPhone(phone: string, since: Date) {
    const { data, error } = await this.db
      .from("leads")
      .select("*")
      .eq("phone", phone)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`leads dedupe lookup failed: ${error.message}`);
    return data ? leadFromRow(data as LeadRow) : null;
  }

  async list(limit: number): Promise<AdminLead[]> {
    const { data, error } = await this.db.from("leads").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(`leads list failed: ${error.message}`);
    return (data as LeadRow[]).map(leadFromRow);
  }

  async markForwarded(id: string, at: Date, buyerRef: string | null) {
    const { data, error } = await this.db
      .from("leads")
      .update({ forward_status: "forwarded", forwarded_at: at.toISOString(), buyer_ref: buyerRef })
      .eq("id", id)
      .neq("forward_status", "forwarded")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`leads update failed: ${error.message}`);
    if (data) return { lead: leadFromRow(data as LeadRow), changed: true };
    const existing = await this.get(id);
    return existing ? { lead: existing, changed: false } : null;
  }
}

export class SupabaseEventStore implements EventStore {
  constructor(private readonly db: SupabaseClient) {}
  async append(e: EventRecord) {
    const { error } = await this.db.from("events").insert({
      session_id: e.sessionId,
      name: e.name,
      ts: e.ts,
      source: e.source,
      attribution_json: e.attribution,
      props_json: e.props,
    });
    if (error) throw new Error(`events insert failed: ${error.message}`);
  }
}

export class SupabaseEmailSignupStore implements EmailSignupStore {
  constructor(private readonly db: SupabaseClient) {}
  async insert(s: EmailSignupRecord) {
    const { error } = await this.db.from("email_signups").insert({
      id: s.id,
      created_at: s.createdAt,
      estimate_id: s.estimateId,
      email: s.email,
      notify_when_covered: s.notifyWhenCovered,
      consent_ts: s.consentTs,
      session_id: s.sessionId,
      attribution_json: s.attribution,
    });
    if (error) throw new Error(`email_signups insert failed: ${error.message}`);
  }
}

export class SupabaseDoNotSellStore implements DoNotSellStore {
  constructor(private readonly db: SupabaseClient) {}
  async insert(r: DoNotSellRecord) {
    const { error } = await this.db.from("do_not_sell_requests").insert({
      id: r.id,
      created_at: r.createdAt,
      email: r.email,
      phone: r.phone,
      name: r.name,
      state: r.state,
      request_type: r.requestType,
      authorized_agent: r.authorizedAgent,
      details: r.details,
      ip_hash: r.ipHash,
      session_id: r.sessionId,
    });
    if (error) throw new Error(`do_not_sell_requests insert failed: ${error.message}`);
  }
  async isOptedOut(by: OptOutLookup) {
    const email = by.email?.trim().toLowerCase();
    const checks: Promise<boolean>[] = [];
    const exists = async (col: "email" | "phone" | "session_id", value: string) => {
      const { count, error } = await this.db.from("do_not_sell_requests").select("id", { count: "exact", head: true }).eq(col, value);
      if (error) throw new Error(`do_not_sell lookup failed: ${error.message}`);
      return (count ?? 0) > 0;
    };
    if (email) checks.push(exists("email", email));
    if (by.phone) checks.push(exists("phone", by.phone));
    if (by.sessionId) checks.push(exists("session_id", by.sessionId));
    return (await Promise.all(checks)).some(Boolean);
  }
}
