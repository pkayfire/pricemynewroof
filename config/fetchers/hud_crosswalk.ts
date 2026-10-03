// HUD USPS ZIP crosswalk: ZIP → CBSA (type=3) or ZIP → county (type=2), plus state.
// API docs: https://www.huduser.gov/portal/dataset/uspszip-api.html
import type { HudCountySource, HudSource } from "../lib/schema";

export const HUD_BASE_URL = "https://www.huduser.gov/hudapi/public/usps";
/** HUD's code for ZIPs outside every CBSA. */
export const NON_CBSA = "99999";
/** HUD crosswalk types used here: 2 = zip-county, 3 = zip-cbsa. */
export const HUD_TYPE = { county: 2, cbsa: 3 } as const;
export type HudType = (typeof HUD_TYPE)[keyof typeof HUD_TYPE];
export const hudUrl = (type: HudType, query = "All") => `${HUD_BASE_URL}?type=${type}&query=${encodeURIComponent(query)}`;

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
  return resolveZipGeo(rows);
}

/**
 * Pick one county per ZIP (type=2 rows, geoid = 5-digit county FIPS), with the same
 * order as the CBSA pick: residential ratio, total ratio, then the lowest code.
 */
export function resolveZipCounty(rows: HudRow[]): Record<string, [county: string, state: string]> {
  return resolveZipGeo(rows);
}

function resolveZipGeo(rows: HudRow[]): Record<string, [geoid: string, state: string]> {
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
  /** Defaults to 3 (zip-cbsa). */
  type?: HudType;
}

/** Downloads a ZIP crosswalk (CBSA by default). The token is only ever sent as a header. */
export async function fetchHudCrosswalk(opts: FetchHudOptions): Promise<HudResponse> {
  if (!opts.token) {
    throw new Error("HUD_API_TOKEN is not set. Add it to .env.local (local) or the repo secrets (CI).");
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const url = hudUrl(opts.type ?? HUD_TYPE.cbsa, opts.query);
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
    sourceUrl: hudUrl(HUD_TYPE.cbsa),
    retrievedAt,
    sample: false,
    year: String(first.year),
    quarter: String(first.quarter),
    value: resolveZipCbsa(responses.flatMap((r) => r.data.results)),
  };
}

/** Turns raw type=2 responses into config/sources/hud_zip_county.json. */
export function toHudCountySource(responses: HudResponse[], retrievedAt: string): HudCountySource {
  const first = responses[0].data;
  if (first.crosswalk_type && first.crosswalk_type !== "zip-county") {
    throw new Error(`expected a zip-county crosswalk, got ${first.crosswalk_type}`);
  }
  return {
    input: "hud_zip_county",
    sourceUrl: hudUrl(HUD_TYPE.county),
    retrievedAt,
    sample: false,
    year: String(first.year),
    quarter: String(first.quarter),
    value: resolveZipCounty(responses.flatMap((r) => r.data.results)),
  };
}
