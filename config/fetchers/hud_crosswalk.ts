// HUD USPS ZIP crosswalk: ZIP → CBSA (type=3) and state.
// API docs: https://www.huduser.gov/portal/dataset/uspszip-api.html
import type { HudSource } from "../lib/schema";

export const HUD_BASE_URL = "https://www.huduser.gov/hudapi/public/usps";
/** HUD's code for ZIPs outside every CBSA. */
export const NON_CBSA = "99999";

export interface HudRow {
  zip: string;
  geoid: string;
  state: string;
  res_ratio: number;
  tot_ratio: number;
  city?: string;
}

export interface HudResponse {
  data: {
    year: string;
    quarter: string;
    input?: string;
    crosswalk_type?: string;
    results: HudRow[];
  };
}

/**
 * Pick one CBSA per ZIP: the highest residential ratio (spec).
 * DECISION: ties on res_ratio (including ZIPs with no residential addresses, all 0)
 * break on the highest total ratio, then prefer a real CBSA over 99999, then the
 * lowest CBSA code, so the result is deterministic.
 */
export function resolveZipCbsa(rows: HudRow[]): Record<string, [cbsa: string, state: string]> {
  const best = new Map<string, HudRow>();
  for (const row of rows) {
    const zip = String(row.zip).padStart(5, "0");
    const current = best.get(zip);
    if (!current || isBetter(row, current)) best.set(zip, { ...row, zip });
  }
  const out: Record<string, [string, string]> = {};
  for (const zip of [...best.keys()].sort()) {
    const row = best.get(zip)!;
    out[zip] = [String(row.geoid).padStart(5, "0"), row.state.toUpperCase()];
  }
  return out;
}

function isBetter(a: HudRow, b: HudRow): boolean {
  if (a.res_ratio !== b.res_ratio) return a.res_ratio > b.res_ratio;
  if (a.tot_ratio !== b.tot_ratio) return a.tot_ratio > b.tot_ratio;
  const aReal = a.geoid !== NON_CBSA;
  const bReal = b.geoid !== NON_CBSA;
  if (aReal !== bReal) return aReal;
  return a.geoid < b.geoid;
}

export interface FetchHudOptions {
  token: string | undefined;
  fetchImpl?: typeof fetch;
  /** Defaults to "All" (the full national file). */
  query?: string;
}

/** Downloads the ZIP→CBSA crosswalk. The token is only ever sent as a header. */
export async function fetchHudCrosswalk(opts: FetchHudOptions): Promise<HudResponse> {
  if (!opts.token) {
    throw new Error("HUD_API_TOKEN is not set. Add it to .env.local (local) or the repo secrets (CI).");
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${HUD_BASE_URL}?type=3&query=${encodeURIComponent(opts.query ?? "All")}`;
  const res = await doFetch(url, { headers: { Authorization: `Bearer ${opts.token}` } });
  if (!res.ok) {
    throw new Error(`HUD crosswalk request failed: HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as HudResponse;
  if (!body?.data?.results?.length) throw new Error("HUD crosswalk response has no results");
  return body;
}

/** Turns raw responses into the committed source record (config/sources/hud_zip_cbsa.json). */
export function toHudSource(responses: HudResponse[], retrievedAt: string): HudSource {
  const first = responses[0].data;
  return {
    input: "hud_zip_cbsa",
    sourceUrl: `${HUD_BASE_URL}?type=3&query=All`,
    retrievedAt,
    sample: false,
    year: String(first.year),
    quarter: String(first.quarter),
    value: resolveZipCbsa(responses.flatMap((r) => r.data.results)),
  };
}
