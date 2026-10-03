// BLS OEWS annual "all data" bulk file → roofers (47-2181) median hourly wage by area.
// File list: https://www.bls.gov/oes/tables.htm ("All data", oesmYYall.zip)
// Field definitions: AREA_TYPE 1 = U.S., 2 = state, 3 = U.S. territory, 4 = MSA, 6 = nonmetropolitan area.
// Wage footnotes: "*" = estimate not released, "#" = wage at or above the top-coded maximum.
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import type { OewsArea, OewsSource } from "../lib/schema";

export const ROOFERS = "47-2181";
export const oewsZipUrl = (yy: string) => `https://www.bls.gov/oes/special-requests/oesm${yy}all.zip`;

type Row = Record<string, unknown>;

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function field(row: Row, name: string): string {
  if (name in row) return str(row[name]);
  const lower = name.toLowerCase();
  for (const k of Object.keys(row)) if (k.toLowerCase() === lower) return str(row[k]);
  return "";
}

/**
 * Display name: metros keep every named city so suburbs see their city
 * ("Los Angeles-Long Beach-Anaheim, CA" → "Los Angeles-Long Beach-Anaheim");
 * "Eastern Montana nonmetropolitan area" → "Eastern Montana";
 * "North Northeastern Ohio nonmetropolitan area (noncontiguous)" → "North Northeastern Ohio".
 */
export function shortAreaName(kind: OewsArea["kind"], title: string): string {
  if (kind === "msa") return title.replace(/,\s*[A-Z]{2}(-[A-Z]{2})*\s*$/, "").trim();
  if (kind === "nonmetro") {
    return title
      .replace(/\s*\(noncontiguous\)\s*$/i, "")
      .replace(/\s+nonmetropolitan area$/i, "")
      .trim();
  }
  return title;
}

function kindOf(areaType: string): OewsArea["kind"] | null {
  switch (Number(areaType)) {
    case 1:
      return "national";
    case 2:
    case 3: // U.S. territories (PR, GU, VI) are treated as state level
      return "state";
    case 4:
      return "msa";
    case 6:
      return "nonmetro";
    default:
      return null;
  }
}

function areaKey(kind: OewsArea["kind"], code: string, state: string): string {
  switch (kind) {
    case "national":
      return "national";
    case "state":
      return `state:${state}`;
    case "msa":
      return `msa:${code}`;
    case "nonmetro":
      return `nonmetro:${code}`;
  }
}

function normalizeCode(kind: OewsArea["kind"], raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (kind === "msa") return digits.slice(-5).padStart(5, "0"); // "0031080" or "31080" → "31080" (CBSA code)
  if (kind === "nonmetro") return digits.padStart(7, "0");
  if (kind === "state") return digits.padStart(2, "0");
  return digits;
}

function parseWage(raw: string): Pick<OewsArea, "hourlyMedian" | "status" | "marker"> {
  if (raw === "") return { hourlyMedian: null, status: "suppressed", marker: "blank" };
  const n = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(n) && n > 0) return { hourlyMedian: n, status: "ok", marker: null };
  // "*", "#", "**" or anything else non-numeric: suppressed, never zero.
  return { hourlyMedian: null, status: "suppressed", marker: raw };
}

function isCrossIndustry(row: Row): boolean {
  const iGroup = field(row, "I_GROUP").toLowerCase();
  const naics = field(row, "NAICS");
  return iGroup ? iGroup === "cross-industry" : naics === "000000" || naics === "";
}

/**
 * Pure parser over the bulk file's rows (header name → cell). Collects every area that
 * appears in the cross-industry rows, then attaches the roofers' median hourly wage.
 * Areas without a roofers row are kept with status "not_published".
 */
export function parseOewsRows(rows: Iterable<Row>): OewsArea[] {
  const areas = new Map<string, OewsArea>();
  const roofers = new Map<string, Row[]>();

  for (const row of rows) {
    if (!isCrossIndustry(row)) continue;
    const kind = kindOf(field(row, "AREA_TYPE"));
    if (!kind) continue;
    const state = field(row, "PRIM_STATE").toUpperCase();
    const code = normalizeCode(kind, field(row, "AREA"));
    const key = areaKey(kind, code, state);
    if (!areas.has(key)) {
      const title = field(row, "AREA_TITLE");
      areas.set(key, {
        key,
        kind,
        code,
        title,
        name: shortAreaName(kind, title),
        state: kind === "national" ? null : state || null,
        hourlyMedian: null,
        status: "not_published",
        marker: null,
      });
    }
    if (field(row, "OCC_CODE") === ROOFERS) {
      const list = roofers.get(key) ?? [];
      list.push(row);
      roofers.set(key, list);
    }
  }

  for (const [key, list] of roofers) {
    // All-ownership row is OWN_CODE 1235; fall back to a lone row if the code differs.
    const chosen = list.find((r) => field(r, "OWN_CODE") === "1235") ?? (list.length === 1 ? list[0] : undefined);
    if (!chosen) {
      throw new Error(`OEWS: ${list.length} ambiguous roofer rows for ${key} and none has OWN_CODE 1235`);
    }
    Object.assign(areas.get(key)!, parseWage(field(chosen, "H_MEDIAN")));
  }

  return [...areas.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function cellText(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if ("result" in o) return o.result;
    if (o.text !== undefined) return o.text;
  }
  return v;
}

/** Streams rows from the first worksheet of an xlsx file, keyed by the header row. */
export async function* readXlsxRows(file: string): AsyncGenerator<Row> {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
    sharedStrings: "cache",
    hyperlinks: "ignore",
    styles: "ignore",
    worksheets: "emit",
    entries: "emit",
  });
  for await (const sheet of reader) {
    let header: string[] | null = null;
    for await (const row of sheet) {
      const values = (row.values as unknown[]).slice(1).map(cellText);
      if (!header) {
        header = values.map((v) => str(v).toUpperCase());
        continue;
      }
      const obj: Row = {};
      header.forEach((h, i) => {
        if (h) obj[h] = values[i];
      });
      yield obj;
    }
    return; // first sheet only
  }
}

/**
 * Keeps only what parseOewsRows needs: every roofers row plus the first row seen for each
 * area, so the ~400k-row file never sits in memory.
 */
async function collectRelevant(it: AsyncIterable<Row>): Promise<Row[]> {
  const out: Row[] = [];
  const seenAreas = new Set<string>();
  for await (const row of it) {
    if (!isCrossIndustry(row)) continue;
    const areaId = `${field(row, "AREA_TYPE")}|${field(row, "AREA")}`;
    if (field(row, "OCC_CODE") === ROOFERS || !seenAreas.has(areaId)) {
      if (field(row, "OCC_CODE") !== ROOFERS) seenAreas.add(areaId);
      out.push(row);
    }
  }
  return out;
}

export interface FetchOewsOptions {
  userAgent: string | undefined;
  cacheDir: string;
  /** Two-digit release year, e.g. "25" for May 2025. Defaults to trying last year, then the year before. */
  releaseYear?: string;
  today: Date;
  fetchImpl?: typeof fetch;
}

/** Downloads (or reuses the cached) bulk zip, extracts the xlsx and returns its path. */
export async function downloadOews(opts: FetchOewsOptions): Promise<{ xlsxPath: string; url: string; yy: string }> {
  if (!opts.userAgent) {
    throw new Error(
      "BLS_USER_AGENT is not set. BLS rejects bulk downloads without a descriptive User-Agent " +
        'with contact info, e.g. BLS_USER_AGENT="PriceMyNewRoof config build (you@example.com)". ' +
        "Set it in .env.local (local) or the repo secrets (CI).",
    );
  }
  const doFetch = opts.fetchImpl ?? fetch;
  const year = opts.today.getUTCFullYear();
  const candidates = opts.releaseYear
    ? [opts.releaseYear]
    : [year - 1, year - 2].map((y) => String(y % 100).padStart(2, "0"));
  fs.mkdirSync(opts.cacheDir, { recursive: true });

  for (const yy of candidates) {
    const url = oewsZipUrl(yy);
    const zipPath = path.join(opts.cacheDir, `oesm${yy}all.zip`);
    if (!fs.existsSync(zipPath)) {
      const res = await doFetch(url, { headers: { "User-Agent": opts.userAgent } });
      if (res.status === 404) continue;
      if (!res.ok) {
        throw new Error(
          `OEWS download failed: HTTP ${res.status} for ${url}` +
            (res.status === 403 ? " (BLS rejected the request; check BLS_USER_AGENT has contact info)" : ""),
        );
      }
      fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    }
    const files = unzipSync(fs.readFileSync(zipPath), {
      filter: (f) => /all_data.*\.xlsx$/i.test(f.name),
    });
    const name = Object.keys(files)[0];
    if (!name) throw new Error(`${zipPath} has no all_data*.xlsx file`);
    const xlsxPath = path.join(opts.cacheDir, path.basename(name));
    fs.writeFileSync(xlsxPath, files[name]);
    return { xlsxPath, url, yy };
  }
  throw new Error(`No OEWS all-data file found for release years ${candidates.join(", ")}`);
}

export async function oewsSourceFromXlsx(
  xlsxPath: string,
  meta: { url: string; yy: string; retrievedAt: string; sample?: boolean },
): Promise<OewsSource> {
  const rows = await collectRelevant(readXlsxRows(xlsxPath));
  return {
    input: "oews_47-2181",
    sourceUrl: meta.url,
    retrievedAt: meta.retrievedAt,
    sample: meta.sample ?? false,
    occupation: ROOFERS,
    release: `May 20${meta.yy}`,
    value: parseOewsRows(rows),
  };
}
