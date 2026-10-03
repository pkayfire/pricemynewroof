// BLS OEWS metropolitan and nonmetropolitan area definitions: county → OEWS area.
// Page: https://www.bls.gov/oes/current/msa_def.htm (file: area_definitions_mYYYY.xlsx)
// Columns: "FIPS Code" (state), "State Abbreviation", "May YYYY Area Code", "May YYYY Area Title",
// "County Code", "County Name". Area codes are 5-digit CBSA codes for MSAs and 7-digit codes
// for nonmetropolitan areas.
import fs from "node:fs";
import path from "node:path";
import type { OewsAreaDefsSource } from "../lib/schema";
import { readXlsxRows } from "./bls_oews";

export const oewsAreaDefsUrl = (yy: string) => `https://www.bls.gov/oes/area_definitions_m20${yy}.xlsx`;

type Row = Record<string, unknown>;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function column(row: Row, test: (name: string) => boolean): string {
  for (const k of Object.keys(row)) if (test(k.toUpperCase())) return str(row[k]);
  return "";
}

/**
 * Pure parser over the definitions file's rows (header name → cell).
 * Returns county FIPS (5 digits) → "msa:<CBSA>" or "nonmetro:<7-digit code>".
 * Throws when a county is listed under two different areas or a row can't be read.
 */
export function parseAreaDefinitionRows(rows: Iterable<Row>): Record<string, string> {
  const out = new Map<string, string>();
  for (const row of rows) {
    const stateFips = column(row, (k) => k === "FIPS CODE").replace(/\D/g, "");
    const countyCode = column(row, (k) => k === "COUNTY CODE").replace(/\D/g, "");
    const areaCode = column(row, (k) => /AREA CODE$/.test(k)).replace(/\D/g, "");
    if (!stateFips && !countyCode && !areaCode) continue; // blank or footnote row
    if (!stateFips || !countyCode || !areaCode) {
      throw new Error(`OEWS area definitions: unreadable row ${JSON.stringify(row)}`);
    }
    const county = stateFips.padStart(2, "0") + countyCode.padStart(3, "0");
    let key: string;
    if (areaCode.length === 7) key = `nonmetro:${areaCode}`;
    else if (areaCode.length <= 5) key = `msa:${areaCode.padStart(5, "0")}`;
    else throw new Error(`OEWS area definitions: unexpected area code "${areaCode}" for county ${county}`);
    const prev = out.get(county);
    if (prev && prev !== key) {
      throw new Error(`OEWS area definitions: county ${county} is listed in both ${prev} and ${key}`);
    }
    out.set(county, key);
  }
  if (out.size === 0) throw new Error("OEWS area definitions: no county rows found");
  return Object.fromEntries(out);
}

export interface FetchAreaDefsOptions {
  userAgent: string | undefined;
  cacheDir: string;
  /** Two-digit release year; use the same release as the wage file. */
  yy: string;
  fetchImpl?: typeof fetch;
}

/** Downloads (or reuses the cached) definitions xlsx and returns its path and URL. */
export async function downloadAreaDefinitions(opts: FetchAreaDefsOptions): Promise<{ xlsxPath: string; url: string }> {
  if (!opts.userAgent) {
    throw new Error("BLS_USER_AGENT is not set. BLS rejects downloads without a descriptive User-Agent with contact info.");
  }
  const url = oewsAreaDefsUrl(opts.yy);
  const xlsxPath = path.join(opts.cacheDir, `area_definitions_m20${opts.yy}.xlsx`);
  if (!fs.existsSync(xlsxPath)) {
    const res = await (opts.fetchImpl ?? fetch)(url, { headers: { "User-Agent": opts.userAgent } });
    if (!res.ok) throw new Error(`OEWS area definitions download failed: HTTP ${res.status} for ${url}`);
    const body = Buffer.from(await res.arrayBuffer());
    // BLS answers some missing pages with a 200 HTML page; an xlsx is a zip ("PK").
    if (body.subarray(0, 2).toString("latin1") !== "PK") {
      throw new Error(`OEWS area definitions: ${url} did not return an xlsx file`);
    }
    fs.mkdirSync(opts.cacheDir, { recursive: true });
    fs.writeFileSync(xlsxPath, body);
  }
  return { xlsxPath, url };
}

export async function areaDefsSourceFromXlsx(
  xlsxPath: string,
  meta: { url: string; yy: string; retrievedAt: string },
): Promise<OewsAreaDefsSource> {
  const rows: Row[] = [];
  for await (const row of readXlsxRows(xlsxPath)) rows.push(row);
  return {
    input: "oews_area_definitions",
    sourceUrl: meta.url,
    retrievedAt: meta.retrievedAt,
    sample: false,
    release: `May 20${meta.yy}`,
    value: parseAreaDefinitionRows(rows),
  };
}
