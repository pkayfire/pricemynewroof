"use server";
// Admin sign-in and sign-out (Supabase Auth, email + password, single allowed email).
import { redirect } from "next/navigation";
import { isAdminEmail } from "@/lib/admin/auth";
import { authClientFromCookies } from "@/lib/admin/session";

export async function signIn(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const client = await authClientFromCookies();
  if (!client) redirect("/admin/login?error=unconfigured");
  // Refuse other emails before contacting Supabase.
  if (!isAdminEmail(email) || !password) redirect("/admin/login?error=invalid");
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !isAdminEmail(data.user?.email)) {
    await client.auth.signOut();
    redirect("/admin/login?error=invalid");
  }
  redirect("/admin/leads");
}

export async function signOut(): Promise<void> {
  const client = await authClientFromCookies();
  if (client) await client.auth.signOut();
  redirect("/admin/login");
}
