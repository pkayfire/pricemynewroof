// HTTP layer for POST /api/estimate, separate from the route file so tests can inject deps.
import { handleEstimate, type EstimateDeps } from "./service";

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

export async function handleEstimatePost(request: Request, deps: () => EstimateDeps): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_request", message: "Body must be JSON." }, 400);
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
