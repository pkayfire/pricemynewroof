// Service-role Supabase client (bypasses RLS). Server only; never import from client components.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const g = globalThis as unknown as { __pmnrServiceClient?: SupabaseClient };

export const hasServiceRole = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);

export function getServiceClient(env: NodeJS.ProcessEnv = process.env): SupabaseClient {
  if (g.__pmnrServiceClient) return g.__pmnrServiceClient;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  g.__pmnrServiceClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return g.__pmnrServiceClient;
}
