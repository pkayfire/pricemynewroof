// Estimate storage. In-memory for tests and local runs without SUPABASE_SERVICE_ROLE_KEY;
// Supabase (service role, server only) otherwise. See supabase-store.ts.
import type { EstimateRecord } from "./types";

export interface EstimateStore {
  insert(record: EstimateRecord): Promise<void>;
  get(id: string): Promise<EstimateRecord | null>;
  /**
   * The newest estimate for a place whose Google-derived measurement (Solar roof or a confirmed
   * "no building") can be reused at `now`: not expired and not purged.
   */
  findReusable(placeId: string, now: Date): Promise<EstimateRecord | null>;
}

export const isReusable = (r: EstimateRecord, now: Date) =>
  r.measurements !== null && r.measurements.solar !== null && Date.parse(r.expiresAt) > now.getTime();

export class MemoryEstimateStore implements EstimateStore {
  private readonly rows = new Map<string, EstimateRecord>();

  async insert(record: EstimateRecord): Promise<void> {
    if (this.rows.has(record.id)) throw new Error("duplicate estimate id");
    this.rows.set(record.id, structuredClone(record));
  }

  async get(id: string): Promise<EstimateRecord | null> {
    const r = this.rows.get(id);
    return r ? structuredClone(r) : null;
  }

  async findReusable(placeId: string, now: Date): Promise<EstimateRecord | null> {
    let best: EstimateRecord | null = null;
    for (const r of this.rows.values()) {
      if (r.placeId !== placeId || !isReusable(r, now)) continue;
      if (!best || r.createdAt > best.createdAt) best = r;
    }
    return best ? structuredClone(best) : null;
  }

  get size() {
    return this.rows.size;
  }
}
