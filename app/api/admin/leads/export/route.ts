// GET /api/admin/leads/export: CSV of the leads table (admin only).
import { handleLeadsExport } from "@/lib/admin/endpoints";
import { currentAdmin } from "@/lib/admin/session";
import { getLeadStore } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Promise<Response> {
  return handleLeadsExport({ checkAdmin: currentAdmin, leads: getLeadStore(), now: () => new Date() });
}
