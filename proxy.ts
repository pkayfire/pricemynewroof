// Next.js 16 proxy (formerly middleware): attribution capture, a rolling session ID, and admin
// session refresh. Kept light: no database calls on public requests, never blocks or redirects
// crawlers. Robots and noindex rules stay in app/robots.ts and page metadata (Milestone 3).
// TODO(Milestone 5): AI crawler logging (write an events row for OAI-AdsBot, OAI-SearchBot, …).
import { NextResponse, type NextRequest } from "next/server";
import { ATTRIBUTION_COOKIE, SESSION_COOKIE } from "@/lib/api/contracts";
import { ATTRIBUTION_MAX_AGE_S, SESSION_IDLE_S, attributionFromUrl, isSessionId, newSessionId } from "@/lib/attribution";
import { createAuthClient } from "@/lib/supabase/auth";

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return adminProxy(request);
  const isApi = url.pathname.startsWith("/api/");
  const secure = url.protocol === "https:";
  const set: { name: string; value: string; maxAge: number }[] = [];

  // Last touch wins: a landing URL with any attribution param replaces the stored set (matching
  // how the OpenAI pixel resets __oppref); URLs without params leave it alone. Pages only.
  // Next URI-encodes cookie values, so the JSON is set as is (read back with decodeAttribution).
  const attribution = isApi ? null : attributionFromUrl(url);
  if (attribution) set.push({ name: ATTRIBUTION_COOKIE, value: JSON.stringify(attribution), maxAge: ATTRIBUTION_MAX_AGE_S });

  // Session: 30 minutes of inactivity, rolling. Every page or API request refreshes the expiry;
  // a new ID is assigned when the cookie is missing (expired) or invalid.
  const current = request.cookies.get(SESSION_COOKIE)?.value;
  const sid = isSessionId(current) ? current : newSessionId();
  set.push({ name: SESSION_COOKIE, value: sid, maxAge: SESSION_IDLE_S });

  // Also set them on the forwarded request so this render or handler already sees them.
  for (const c of set) request.cookies.set(c.name, c.value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const c of set) {
    // Readable by the page script (it mirrors attribution into sessionStorage and sends the
    // session ID with events); neither cookie is a credential.
    response.cookies.set(c.name, c.value, { path: "/", sameSite: "lax", secure, httpOnly: false, maxAge: c.maxAge });
  }
  return response;
}

/** Refreshes the Supabase Auth session cookies for admin pages; the pages check the admin email. */
async function adminProxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const client = createAuthClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookies) => {
      for (const { name, value } of cookies) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
    },
  });
  if (client) await client.auth.getUser();
  response.headers.set("x-robots-tag", "noindex, nofollow");
  return response;
}

export const config = {
  // Pages and public API routes. Skips the admin API (it checks the Supabase session itself),
  // Next internals, and files with an extension (robots.txt, sitemap.xml, images, icons).
  matcher: ["/((?!api/admin/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
