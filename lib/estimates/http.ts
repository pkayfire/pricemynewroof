// HTTP layer for POST /api/estimate, separate from the route file so tests can inject deps.
import { isSessionId, requestContext } from "@/lib/attribution";
import { clientIp } from "@/lib/http/request";
import { enforceLimit, LIMITS, type RateLimiter } from "@/lib/ratelimit";
import { handleEstimate, type EstimateDeps } from "./service";

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export interface EstimateHttpOptions {
  /** 500 per hour per IP and per session (Build decisions, Leads). Omit to skip limiting. */
  limiter?: RateLimiter;
  now?: () => Date;
}

export async function handleEstimatePost(
  request: Request,
  deps: () => EstimateDeps,
  opts: EstimateHttpOptions = {},
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request", message: "Body must be JSON." }, 400);
  }
  const ctx = requestContext(request, clientIp(request));
  // The session is the body's sessionId (plain HTTP clients) or the pmnr_sid cookie.
  const bodySession = (body as { sessionId?: unknown } | null)?.sessionId;
  const sessionId = isSessionId(bodySession) ? bodySession : ctx.sessionId;
  if (opts.limiter) {
    const limited = await enforceLimit(opts.limiter, LIMITS.estimate, { ip: ctx.ip, sessionId }, opts.now);
    if (limited) return limited;
  }
  // Attach the cookie session when the body has none, so estimates join to events.
  if (sessionId && body && typeof body === "object" && !Array.isArray(body) && (body as { sessionId?: unknown }).sessionId === undefined) {
    body = { ...(body as object), sessionId };
  }
  try {
    const result = await handleEstimate(body, deps());
    return json(result.body, result.status);
  } catch (e) {
    // Log the error type and message only; never request bodies or keys.
    console.error("[estimate] failed:", (e as Error).name, (e as Error).message);
    return json({ error: "internal_error", message: "The estimate could not be computed." }, 500);
  }
}
