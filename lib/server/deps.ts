// Production wiring for the Milestone 4 services. Server only. Supabase when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set; in-memory otherwise (local development only; production
// refuses to run without Supabase, as for the estimate store).
import { getServiceClient, hasServiceRole } from "@/lib/supabase/service";
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from "@/lib/ratelimit";

type Cache = { limiter?: RateLimiter };
const g = globalThis as unknown as { __pmnrDeps?: Cache };
const cache = (): Cache => (g.__pmnrDeps ??= {});

export function supabaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (hasServiceRole(env)) return true;
  if (env.NODE_ENV === "production") throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  return false;
}

export function getRateLimiter(env: NodeJS.ProcessEnv = process.env): RateLimiter {
  const c = cache();
  return (c.limiter ??= supabaseEnabled(env) ? new SupabaseRateLimiter(getServiceClient(env)) : new MemoryRateLimiter());
}
