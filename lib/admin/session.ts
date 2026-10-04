// The admin check for server components, server actions and route handlers (next/headers cookies).
import { cookies } from "next/headers";
import { createAuthClient } from "@/lib/supabase/auth";
import { checkAdmin, type AdminCheck } from "./auth";

export async function authClientFromCookies() {
  const store = await cookies();
  return createAuthClient({
    getAll: () => store.getAll(),
    setAll: (list) => {
      for (const { name, value, options } of list) store.set(name, value, options);
    },
  });
}

export async function currentAdmin(): Promise<AdminCheck> {
  return checkAdmin(await authClientFromCookies());
}
