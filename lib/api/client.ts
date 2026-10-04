// Browser calls to the app's own API routes.
import type { EstimateRequest, EstimateResponse } from "./types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number };

export async function postJson<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const postEstimate = (req: EstimateRequest) => postJson<EstimateResponse>("/api/estimate", req);

/** User-facing message for a failed POST /api/estimate. */
export function estimateErrorMessage(status: number): string {
  if (status === 400 || status === 404 || status === 422)
    return "We couldn't find a home at that address. Check it and choose it from the list.";
  if (status === 429) return "You've measured a lot of roofs from this connection. Try again in an hour.";
  if (status === 0) return "We couldn't reach our server. Check your connection and try again.";
  return "Something went wrong measuring your roof. Please try again in a minute.";
}
