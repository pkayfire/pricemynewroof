// POST /api/events: { sessionId, name, props } → 204. Append-only funnel log with attribution.
import { handleEventsPost } from "@/lib/leads/endpoints";
import { eventsDeps } from "@/lib/server/deps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request): Promise<Response> {
  return handleEventsPost(request, () => eventsDeps());
}
