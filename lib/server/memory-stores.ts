// In-memory stores for tests and local runs without Supabase.
import type {
  AdminLead,
  DoNotSellRecord,
  DoNotSellStore,
  EmailSignupRecord,
  EmailSignupStore,
  EventRecord,
  EventStore,
  LeadRecord,
  LeadStore,
  OptOutLookup,
} from "./stores";

export class MemoryLeadStore implements LeadStore {
  readonly rows = new Map<string, LeadRecord>();
  /** Optional address lookup by estimate ID, standing in for the estimates join. */
  constructor(private readonly addressOf: (estimateId: string) => Promise<string | null> = async () => null) {}

  async insert(lead: LeadRecord) {
    if (this.rows.has(lead.id)) throw new Error("duplicate lead id");
    this.rows.set(lead.id, structuredClone(lead));
  }
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }
  async findRecentByPhone(phone: string, since: Date) {
    let best: LeadRecord | null = null;
    for (const r of this.rows.values()) {
      if (r.phone !== phone || Date.parse(r.createdAt) < since.getTime()) continue;
      if (!best || r.createdAt > best.createdAt) best = r;
    }
    return best ? structuredClone(best) : null;
  }
  async list(limit: number): Promise<AdminLead[]> {
    const rows = [...this.rows.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
    return Promise.all(rows.map(async (r) => ({ ...structuredClone(r), address: await this.addressOf(r.estimateId) })));
  }
  async markForwarded(id: string, at: Date, buyerRef: string | null) {
    const r = this.rows.get(id);
    if (!r) return null;
    if (r.forwardStatus === "forwarded") return { lead: structuredClone(r), changed: false };
    r.forwardStatus = "forwarded";
    r.forwardedAt = at.toISOString();
    r.buyerRef = buyerRef;
    return { lead: structuredClone(r), changed: true };
  }
}

export class MemoryEventStore implements EventStore {
  readonly events: EventRecord[] = [];
  async append(event: EventRecord) {
    this.events.push(structuredClone(event));
  }
}

export class MemoryEmailSignupStore implements EmailSignupStore {
  readonly rows: EmailSignupRecord[] = [];
  async insert(signup: EmailSignupRecord) {
    this.rows.push(structuredClone(signup));
  }
}

export class MemoryDoNotSellStore implements DoNotSellStore {
  readonly rows: DoNotSellRecord[] = [];
  async insert(record: DoNotSellRecord) {
    this.rows.push(structuredClone(record));
  }
  async isOptedOut(by: OptOutLookup) {
    const email = by.email?.trim().toLowerCase();
    return this.rows.some(
      (r) => (email && r.email === email) || (by.phone && r.phone === by.phone) || (by.sessionId && r.sessionId === by.sessionId),
    );
  }
}
