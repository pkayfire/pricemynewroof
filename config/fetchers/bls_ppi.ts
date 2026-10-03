// BLS Public Data API v2: PPI series for roofing materials.
// API docs: https://www.bls.gov/developers/api_signature_v2.htm
import type { PpiFamily, PpiSource } from "../lib/schema";

export const BLS_API_URL = "https://api.bls.gov/publicAPI/v2/timeseries/data/";

export interface BlsDataPoint {
  year: string;
  period: string;
  value: string;
  latest?: string;
  footnotes?: { code?: string; text?: string }[];
}
export interface BlsSeries {
  seriesID: string;
  catalog?: { series_title?: string };
  data: BlsDataPoint[];
}
export interface BlsApiResponse {
  status: string;
  message?: string[];
  Results?: { series: BlsSeries[] };
}

export interface PpiSeriesSpec {
  family: PpiFamily;
  seriesId: string;
  title: string;
  sourceUrl: string;
}

export interface FetchPpiOptions {
  apiKey: string | undefined;
  seriesIds: string[];
  startYear: number;
  endYear: number;
  fetchImpl?: typeof fetch;
}

/** POSTs one request for all series. The key is sent in the body only, never logged. */
export async function fetchPpi(opts: FetchPpiOptions): Promise<BlsApiResponse> {
  if (!opts.apiKey) {
    throw new Error("BLS_API_KEY is not set. Add it to .env.local (local) or the repo secrets (CI).");
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(BLS_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seriesid: opts.seriesIds,
      startyear: String(opts.startYear),
      endyear: String(opts.endYear),
      catalog: true,
      registrationkey: opts.apiKey,
    }),
  });
  if (!res.ok) throw new Error(`BLS API request failed: HTTP ${res.status} ${res.statusText}`);
  const body = (await res.json()) as BlsApiResponse;
  if (body.status !== "REQUEST_SUCCEEDED") {
    throw new Error(`BLS API returned ${body.status}: ${(body.message ?? []).join("; ")}`);
  }
  return body;
}

function toPoint(d: BlsDataPoint) {
  const month = /^M(0[1-9]|1[0-2])$/.exec(d.period);
  if (!month) return null; // skip M13 (annual average) and anything unexpected
  const value = Number(d.value);
  if (!Number.isFinite(value) || value <= 0) return null; // "-" = not available
  return {
    period: `${d.year}-${month[1]}`,
    value,
    preliminary: (d.footnotes ?? []).some((f) => f?.code === "P"),
  };
}

/**
 * Extracts the base-date value and the latest monthly value for one series.
 * base is null when the base month is not published yet (the build check catches that).
 */
export function extractPpi(
  response: BlsApiResponse,
  spec: PpiSeriesSpec,
  baseDate: string,
  retrievedAt: string,
): PpiSource {
  const series = response.Results?.series.find((s) => s.seriesID === spec.seriesId);
  if (!series) throw new Error(`BLS response has no data for series ${spec.seriesId}`);
  const points = series.data.map(toPoint).filter((p) => p !== null);
  if (points.length === 0) throw new Error(`Series ${spec.seriesId} has no monthly values`);
  points.sort((a, b) => b.period.localeCompare(a.period));
  const latest = points[0];
  const base = points.find((p) => p.period === baseDate) ?? null;
  return {
    input: `ppi_${spec.family}`,
    sourceUrl: spec.sourceUrl,
    retrievedAt,
    sample: false,
    family: spec.family,
    seriesId: spec.seriesId,
    title: series.catalog?.series_title ?? spec.title,
    baseDate,
    base,
    latest,
    value: latest.value,
  };
}

/** materialRatio = ppiNow / ppiAtBaseDate, rounded to 4 decimals. */
export function ppiRatio(latestValue: number, baseValue: number): number {
  if (!(baseValue > 0)) throw new Error("PPI base value must be positive");
  return Math.round((latestValue / baseValue) * 10_000) / 10_000;
}
