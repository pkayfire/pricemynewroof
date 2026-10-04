import { authConfig } from "@/lib/supabase/auth";
import { signIn } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid: "That email and password didn't work.",
  unconfigured: "Admin sign-in isn't configured yet.",
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!authConfig()) {
    return (
      <>
        <h1>Admin sign-in</h1>
        <p>Admin sign-in isn&apos;t configured. Set NEXT_PUBLIC_SUPABASE_ANON_KEY to enable it.</p>
      </>
    );
  }
  return (
    <>
      <h1>Admin sign-in</h1>
      {error && ERRORS[error] ? <p role="alert">{ERRORS[error]}</p> : null}
      <form action={signIn} style={{ display: "grid", gap: 12, maxWidth: 360 }}>
        <label>
          Email
          <br />
          <input name="email" type="email" autoComplete="username" required style={{ minHeight: 44, width: "100%" }} />
        </label>
        <label>
          Password
          <br />
          <input name="password" type="password" autoComplete="current-password" required style={{ minHeight: 44, width: "100%" }} />
        </label>
        <button type="submit" style={{ minHeight: 44 }}>
          Sign in
        </button>
      </form>
    </>
  );
}
