// Admin access: Supabase Auth (email + password) and a single allowed email (ADMIN_EMAIL).
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_ADMIN_EMAIL = "peterkim45366@gmail.com";

export const adminEmail = (env: NodeJS.ProcessEnv = process.env) => (env.ADMIN_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL).toLowerCase();

export const isAdminEmail = (email: string | null | undefined, env: NodeJS.ProcessEnv = process.env) =>
  typeof email === "string" && email.trim().toLowerCase() === adminEmail(env);

export type AdminCheck =
  | { status: "ok"; email: string }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  /** NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_URL) is not set. */
  | { status: "unconfigured" };

/** Verifies the session with Supabase (getUser, not just the cookie) and checks the admin email. */
export async function checkAdmin(client: SupabaseClient | null, env: NodeJS.ProcessEnv = process.env): Promise<AdminCheck> {
  if (!client) return { status: "unconfigured" };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return { status: "unauthenticated" };
  return isAdminEmail(data.user.email, env) ? { status: "ok", email: data.user.email! } : { status: "forbidden" };
}

/** The HTTP response for a failed admin check on an API route, or null when allowed. */
export function adminDenied(check: AdminCheck): Response | null {
  switch (check.status) {
    case "ok":
      return null;
    case "unconfigured":
      return Response.json({ error: "admin_unconfigured", message: "Admin sign-in is not configured." }, { status: 503 });
    case "unauthenticated":
      return Response.json({ error: "unauthenticated", message: "Sign in at /admin/login." }, { status: 401 });
    case "forbidden":
      return Response.json({ error: "forbidden", message: "This account is not allowed." }, { status: 403 });
  }
}
