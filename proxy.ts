// Next.js 16 proxy (formerly middleware): attribution capture, session ID, and admin session
// refresh. Kept light: no database calls on public pages, never blocks or redirects crawlers.
// TODO(Milestone 5): AI crawler logging (write an events row for OAI-AdsBot, OAI-SearchBot, …).
import { NextResponse, type NextRequest } from "next/server";
import { ATTRIBUTION_COOKIE, SESSION_COOKIE } from "@/lib/api/contracts";
import { ATTRIBUTION_MAX_AGE_S, attributionFromUrl, encodeAttribution, isSessionId, newSessionId } from "@/lib/attribution";
import { createAuthClient } from "@/lib/supabase/auth";

export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return adminProxy(request);

  const secure = url.protocol === "https:";
  const set: { name: string; value: string; maxAge?: number }[] = [];

  // DECISION: last touch wins: a landing URL with any attribution param replaces the stored set
  // (matching how the OpenAI pixel resets __oppref); URLs without params leave it alone.
  const attribution = attributionFromUrl(url);
  if (attribution) set.push({ name: ATTRIBUTION_COOKIE, value: encodeAttribution(attribution), maxAge: ATTRIBUTION_MAX_AGE_S });

  // DECISION: the session ID is a browser-session cookie (no Max-Age), assigned once.
  if (!isSessionId(request.cookies.get(SESSION_COOKIE)?.value)) set.push({ name: SESSION_COOKIE, value: newSessionId() });

  if (set.length === 0) return NextResponse.next();
  // Also set them on the forwarded request so this first render already sees them.
  for (const c of set) request.cookies.set(c.name, c.value);
  const response = NextResponse.next({ request: { headers: request.headers } });
  for (const c of set) {
    // Readable by the page script (it mirrors attribution into sessionStorage and sends the
    // session ID with events); neither cookie is a credential.
    response.cookies.set(c.name, c.value, { path: "/", sameSite: "lax", secure, httpOnly: false, ...(c.maxAge ? { maxAge: c.maxAge } : {}) });
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
  // Pages only: skip API routes, Next internals, and files with an extension (robots.txt,
  // sitemap.xml, images, favicon).
  matcher: ["/((?!api/|_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
