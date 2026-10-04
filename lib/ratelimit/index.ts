// Fixed-window rate limiting (Build decisions, Leads: 500 estimates per hour per IP and per
// session, stored in Supabase). In-memory implementation for tests and local runs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256Hex } from "@/lib/server/hash";

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  resetAt: Date;
}

export interface RateLimiter {
  hit(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

/** Windows aligned to multiples of windowSeconds since the epoch (same as the SQL function). */
export class MemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  async hit(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const ms = windowSeconds * 1000;
    const start = Math.floor(this.now().getTime() / ms) * ms;
    const k = `${bucket}\u0000${key}\u0000${start}`;
    const hits = (this.counts.get(k) ?? 0) + 1;
    this.counts.set(k, hits);
    if (this.counts.size > 10_000) this.prune(start);
    return { allowed: hits <= limit, hits, resetAt: new Date(start + ms) };
  }

  private prune(currentStart: number) {
    for (const k of this.counts.keys()) if (Number(k.split("\u0000")[2]) < currentStart) this.counts.delete(k);
  }
}

/** Calls public.rate_limit_hit (supabase/migrations/*_rate_limits.sql): one atomic upsert per hit. */
export class SupabaseRateLimiter implements RateLimiter {
  constructor(private readonly db: SupabaseClient) {}

  async hit(bucket: string, key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const { data, error } = await this.db.rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(`rate_limit_hit failed: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as { allowed: boolean; hits: number; reset_at: string } | undefined;
    if (!row) throw new Error("rate_limit_hit returned no row");
    return { allowed: row.allowed, hits: row.hits, resetAt: new Date(row.reset_at) };
  }
}

export interface LimitRule {
  bucket: string;
  limit: number;
  windowSeconds: number;
}

/** Per-endpoint limits. */
export const LIMITS = {
  estimate: { bucket: "estimate", limit: 500, windowSeconds: 3600 },
  // DECISION: limits for the other public POST endpoints (not in the spec), per IP per hour.
  lead: { bucket: "lead", limit: 20, windowSeconds: 3600 },
  emailEstimate: { bucket: "email_estimate", limit: 20, windowSeconds: 3600 },
  doNotSell: { bucket: "do_not_sell", limit: 20, windowSeconds: 3600 },
  events: { bucket: "events", limit: 600, windowSeconds: 3600 },
} as const satisfies Record<string, LimitRule>;

/** Keys are hashed so raw IPs never reach the rate_limits table. */
export const limitKey = (kind: "ip" | "session", value: string) => sha256Hex(`${kind}:${value}`);

/**
 * Applies the rule to each identifier (IP, session). Returns a 429 response with Retry-After
 * when any is over the limit, else null. DECISION: if the limiter itself fails (database down),
 * the request is allowed (fail open) and the error logged; the Google daily budget cap is the
 * backstop for spend.
 */
export async function enforceLimit(
  limiter: RateLimiter,
  rule: LimitRule,
  ids: { ip: string | null; sessionId?: string | null },
  now: () => Date = () => new Date(),
): Promise<Response | null> {
  const keys: string[] = [];
  if (ids.ip) keys.push(limitKey("ip", ids.ip));
  if (ids.sessionId) keys.push(limitKey("session", ids.sessionId));
  if (keys.length === 0) keys.push(limitKey("ip", "unknown"));
  let results: RateLimitResult[];
  try {
    results = await Promise.all(keys.map((k) => limiter.hit(rule.bucket, k, rule.limit, rule.windowSeconds)));
  } catch (e) {
    console.error(`[ratelimit] ${rule.bucket} check failed, allowing:`, (e as Error).message);
    return null;
  }
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length === 0) return null;
  const resetAt = Math.max(...blocked.map((r) => r.resetAt.getTime()));
  const retryAfter = Math.max(1, Math.ceil((resetAt - now().getTime()) / 1000));
  return Response.json(
    { error: "rate_limited", message: "Too many requests. Try again later." },
    { status: 429, headers: { "retry-after": String(retryAfter), "cache-control": "no-store" } },
  );
}
