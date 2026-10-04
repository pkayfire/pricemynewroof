// Supabase Auth with cookie sessions (@supabase/ssr) for the single admin user. Uses the anon
// (publishable) key, NEXT_PUBLIC_SUPABASE_ANON_KEY; without it admin sign-in is disabled and the
// rest of the app is unaffected. Server only (the login form posts to a server action).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CookieJar {
  getAll(): { name: string; value: string }[];
  setAll?(cookies: { name: string; value: string; options: CookieOptions }[]): void;
}

export function authConfig(env: NodeJS.ProcessEnv = process.env): { url: string; anonKey: string } | null {
  const url = env.SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function createAuthClient(jar: CookieJar, env: NodeJS.ProcessEnv = process.env): SupabaseClient | null {
  const cfg = authConfig(env);
  if (!cfg) return null;
  return createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (cookies) => {
        try {
          jar.setAll?.(cookies);
        } catch {
          // Server components can't set cookies; proxy.ts refreshes the session for /admin.
        }
      },
    },
  });
}
