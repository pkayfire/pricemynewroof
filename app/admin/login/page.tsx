import { authConfig } from "@/lib/supabase/auth";
import { signIn } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That email and password didn't work.",
  unconfigured: "Admin sign-in isn't configured yet.",
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <>
      <h1 className="h1-page">Admin sign-in</h1>
      <section className="panel state-panel admin-login" aria-label="Sign in">
        {!authConfig() ? (
          <p className="note">
            <strong>Sign-in isn&apos;t configured.</strong> Set NEXT_PUBLIC_SUPABASE_ANON_KEY to enable it.
          </p>
        ) : (
          <form action={signIn} noValidate>
            {error && ERRORS[error] ? (
              <p className="error" role="alert">
                {ERRORS[error]}
              </p>
            ) : null}
            <div className="field">
              <label htmlFor="admin-email" className="label">
                Email
              </label>
              <input id="admin-email" className="input" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="admin-password" className="label">
                Password
              </label>
              <input id="admin-password" className="input" name="password" type="password" autoComplete="current-password" required />
            </div>
            <div>
              <button type="submit" className="btn btn-primary">
                Sign in
              </button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}
