// POST /api/admin/leads/[id]/forwarded: sets forward_status = "forwarded" and forwarded_at
// (admin only); records lead_forwarded and sends it to the OpenAI Conversions API when enabled.
import { handleMarkForwarded } from "@/lib/admin/endpoints";
import { currentAdmin } from "@/lib/admin/session";
import { markForwardedDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await ctx.params;
  return handleMarkForwarded(request, id, { checkAdmin: currentAdmin, ...markForwardedDeps() });
}
