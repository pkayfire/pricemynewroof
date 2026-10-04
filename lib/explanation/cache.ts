// Explanation cache keyed by SHA-256 of the canonicalized drivers (docs/SPEC.md "Caching and review").
// Supabase `explanations` table (server-only, service role key) with an in-memory fallback when
// Supabase isn't configured or can't be reached.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface CachedExplanation {
  driversHash: string;
  text: string;
  model: string;
  latencyMs: number;
  source: "llm" | "template";
  /** ISO timestamp; entries older than 30 days are ignored (text carries Solar-derived numbers). */
  createdAt: string;
}

export interface ExplanationCache {
  get(driversHash: string): Promise<CachedExplanation | null>;
  set(entry: CachedExplanation): Promise<void>;
}

export const CACHE_MAX_AGE_MS = 30 * 86_400_000;

export function isFresh(entry: CachedExplanation, now = Date.now()): boolean {
  return now - Date.parse(entry.createdAt) < CACHE_MAX_AGE_MS;
}

export class MemoryExplanationCache implements ExplanationCache {
  private readonly map = new Map<string, CachedExplanation>();
  constructor(private readonly maxEntries = 1000) {}

  async get(hash: string) {
    const hit = this.map.get(hash);
    if (!hit) return null;
    if (!isFresh(hit)) {
      this.map.delete(hash);
      return null;
    }
    return hit;
  }

  async set(entry: CachedExplanation) {
    if (this.map.size >= this.maxEntries && !this.map.has(entry.driversHash)) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(entry.driversHash, entry);
  }
}

interface Row {
  drivers_hash: string;
  text: string;
  model: string;
  latency_ms: number;
  source: "llm" | "template";
  created_at: string;
}

/** The `explanations` table via supabase-js with the service role key (server only). */
export class SupabaseExplanationCache implements ExplanationCache {
  constructor(
    private readonly db: SupabaseClient,
    private readonly timeoutMs = 800,
  ) {}

  static fromEnv(url: string, serviceKey: string): SupabaseExplanationCache {
    return new SupabaseExplanationCache(
      createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    );
  }

  async get(hash: string) {
    const { data, error } = await this.db
      .from("explanations")
      .select("drivers_hash,text,model,latency_ms,source,created_at")
      .eq("drivers_hash", hash)
      .abortSignal(AbortSignal.timeout(this.timeoutMs))
      .maybeSingle();
    if (error) throw new Error(`explanations select failed: ${error.message}`);
    const r = data as Row | null;
    if (!r) return null;
    const entry: CachedExplanation = {
      driversHash: r.drivers_hash,
      text: r.text,
      model: r.model,
      latencyMs: r.latency_ms,
      source: r.source,
      createdAt: r.created_at,
    };
    return isFresh(entry) ? entry : null;
  }

  async set(e: CachedExplanation) {
    const row: Row = {
      drivers_hash: e.driversHash,
      text: e.text,
      model: e.model,
      latency_ms: e.latencyMs,
      source: e.source,
      created_at: e.createdAt,
    };
    const { error } = await this.db
      .from("explanations")
      .upsert(row, { onConflict: "drivers_hash" })
      .abortSignal(AbortSignal.timeout(this.timeoutMs));
    if (error) throw new Error(`explanations upsert failed: ${error.message}`);
  }
}

/** Memory first, then the durable store; any durable-store failure falls back to memory. */
export class LayeredExplanationCache implements ExplanationCache {
  constructor(
    private readonly durable: ExplanationCache | null,
    private readonly memory: ExplanationCache = new MemoryExplanationCache(),
    private readonly onError: (op: string, err: unknown) => void = () => {},
  ) {}

  async get(hash: string) {
    const hit = await this.memory.get(hash);
    if (hit || !this.durable) return hit;
    try {
      const row = await this.durable.get(hash);
      if (row) await this.memory.set(row);
      return row;
    } catch (err) {
      this.onError("get", err);
      return null;
    }
  }

  async set(entry: CachedExplanation) {
    await this.memory.set(entry);
    if (!this.durable) return;
    try {
      await this.durable.set(entry);
    } catch (err) {
      this.onError("set", err);
    }
  }
}

let defaultCache: ExplanationCache | null = null;

export function getDefaultCache(): ExplanationCache {
  if (defaultCache) return defaultCache;
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const durable = url && key ? SupabaseExplanationCache.fromEnv(url, key) : null;
  defaultCache = new LayeredExplanationCache(durable, new MemoryExplanationCache(), (op, err) =>
    console.warn(
      JSON.stringify({ event: "explanation_cache_error", op, error: err instanceof Error ? err.message : String(err) }),
    ),
  );
  return defaultCache;
}
