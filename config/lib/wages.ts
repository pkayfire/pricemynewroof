// ZIP → wage area via the fallback chain: metro → state → national (spec).
import { NON_CBSA } from "../fetchers/hud_crosswalk";
import type { OewsArea, ZipEntry } from "./schema";

export interface WageIndex {
  byKey: Map<string, OewsArea>;
  /** County FIPS → OEWS area key ("msa:…" or "nonmetro:…"), from the OEWS area definitions. */
  countyArea: Map<string, string>;
}

export function indexWages(areas: OewsArea[], countyAreas: Record<string, string> = {}): WageIndex {
  return {
    byKey: new Map(areas.map((a) => [a.key, a])),
    countyArea: new Map(Object.entries(countyAreas)),
  };
}

const usable = (a: OewsArea | undefined): a is OewsArea => !!a && a.status === "ok" && a.hourlyMedian !== null;

export interface ZipGeo {
  /** HUD CBSA code, "99999" when outside every CBSA. */
  cbsa: string;
  state: string;
  /** HUD county FIPS (highest residential ratio), or null when the county crosswalk has no row. */
  county: string | null;
}

/**
 * Resolves one ZIP. Returns null only when even the national wage is unusable
 * (the build check then fails).
 *
 * - CBSA that OEWS publishes as an MSA → that MSA's wage (suppressed → state, national).
 * - CBSA 99999 (outside every CBSA) or a CBSA OEWS doesn't define as an MSA (micropolitan)
 *   → county (HUD zip-county) → OEWS nonmetropolitan area (OEWS area definitions). A
 *   nonmetro area counts as wageSource "metro" (its own wage, no fallback); the area's
 *   kind ("nonmetro") is kept on the area record for wording.
 *   DECISION: if the definitions put that county in an MSA (HUD and OEWS delineations
 *   disagree), we don't guess; the ZIP falls back to the state wage.
 * - An OEWS MSA with no usable roofer wage → state wage (spec), not the nonmetro area.
 * - Anything unplaceable (no county, county not in the definitions, suppressed nonmetro
 *   wage) → state wage, then national.
 */
export function resolveZipWage(geo: ZipGeo, idx: WageIndex): ZipEntry | null {
  const { cbsa, state, county } = geo;
  const base = { state, cbsa: cbsa === NON_CBSA ? null : cbsa, county };

  let area = cbsa === NON_CBSA ? undefined : idx.byKey.get(`msa:${cbsa}`);
  if (!area) {
    const key = county ? idx.countyArea.get(county) : undefined;
    if (key?.startsWith("nonmetro:")) area = idx.byKey.get(key);
  }
  if (usable(area)) return { ...base, wageArea: area.key, wageSource: "metro" };

  const stateArea = idx.byKey.get(`state:${state}`);
  if (usable(stateArea)) return { ...base, wageArea: stateArea.key, wageSource: "state" };

  const national = idx.byKey.get("national");
  if (usable(national)) return { ...base, wageArea: national.key, wageSource: "national" };

  return null;
}
