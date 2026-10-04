// HTTP handlers for the admin API routes. Every handler checks the admin first.
import { markLeadForwarded, type MarkForwardedDeps } from "@/lib/leads/mark-forwarded";
import { json } from "@/lib/http/request";
import type { LeadStore } from "@/lib/server/stores";
import { adminDenied, type AdminCheck } from "./auth";
import { leadsCsv } from "./csv";

/** Rows per export / listing (v1 volume is small). */
export const ADMIN_LEAD_LIMIT = 5000;

export interface AdminDeps {
  checkAdmin(): Promise<AdminCheck>;
}

export async function handleLeadsExport(deps: AdminDeps & { leads: LeadStore; now(): Date }): Promise<Response> {
  const denied = adminDenied(await deps.checkAdmin());
  if (denied) return denied;
  const leads = await deps.leads.list(ADMIN_LEAD_LIMIT);
  const day = deps.now().toISOString().slice(0, 10);
  return new Response(leadsCsv(leads), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${day}.csv"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex",
    },
  });
}

/** Rejects cross-site posts (the Supabase auth cookies are SameSite=Lax, this is a second check). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/admin/leads/[id]/forwarded. Accepts JSON { buyerRef? } or a form post from
 * /admin/leads (then redirects back with 303).
 */
export async function handleMarkForwarded(request: Request, id: string, deps: AdminDeps & MarkForwardedDeps): Promise<Response> {
  const denied = adminDenied(await deps.checkAdmin());
  if (denied) return denied;
  if (!sameOrigin(request)) return json({ error: "forbidden", message: "Cross-site request refused." }, 403);
  if (!UUID.test(id)) return json({ error: "invalid_request", message: "Invalid lead id." }, 400);

  const isForm = (request.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded");
  let buyerRef: string | null = null;
  try {
    if (isForm) {
      const v = (await request.formData()).get("buyerRef");
      buyerRef = typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
    } else if (request.headers.get("content-length") !== "0" && (request.headers.get("content-type") ?? "").includes("json")) {
      const body = (await request.json()) as { buyerRef?: unknown };
      buyerRef = typeof body?.buyerRef === "string" && body.buyerRef.trim() ? body.buyerRef.trim().slice(0, 200) : null;
    }
  } catch {
    return json({ error: "invalid_request", message: "Body could not be read." }, 400);
  }

  const result = await markLeadForwarded(id, buyerRef, deps);
  if (result.status === 404) return json({ error: "not_found", message: "Lead not found." }, 404);
  if (isForm) return new Response(null, { status: 303, headers: { location: "/admin/leads" } });
  return json({ ok: true, forwardStatus: result.lead.forwardStatus, forwardedAt: result.lead.forwardedAt, changed: result.changed });
}
