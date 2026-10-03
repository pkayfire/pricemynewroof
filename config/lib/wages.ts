// ZIP → wage area via the fallback chain: metro → state → national (spec).
import { NON_CBSA } from "../fetchers/hud_crosswalk";
import type { OewsArea, ZipEntry } from "./schema";

export interface WageIndex {
  byKey: Map<string, OewsArea>;
  nonmetroByState: Map<string, OewsArea[]>;
}

export function indexWages(areas: OewsArea[]): WageIndex {
  const byKey = new Map(areas.map((a) => [a.key, a]));
  const nonmetroByState = new Map<string, OewsArea[]>();
  for (const a of areas) {
    if (a.kind !== "nonmetro" || !a.state) continue;
    const list = nonmetroByState.get(a.state) ?? [];
    list.push(a);
    nonmetroByState.set(a.state, list);
  }
  return { byKey, nonmetroByState };
}

const usable = (a: OewsArea | undefined): a is OewsArea => !!a && a.status === "ok" && a.hourlyMedian !== null;

/**
 * Resolves one ZIP. Returns null only when even the national wage is unusable
 * (the build check then fails).
 *
 * - CBSA that OEWS publishes as an MSA → that MSA's wage.
 * - CBSA 99999 (outside every CBSA) → the state's nonmetropolitan area.
 *   DECISION: OEWS splits most states into several nonmetropolitan areas, and the ZIP→CBSA
 *   crosswalk can't tell which one a ZIP is in. We use the nonmetro area only when the
 *   state has exactly one; otherwise we fall back to the state wage (honest, lower confidence).
 * - Any other CBSA that OEWS doesn't publish (micropolitan areas, or a delineation mismatch)
 *   → state wage. DECISION: we can't tell micropolitan from an unmatched metro without
 *   another data file, and putting a metro ZIP on a rural wage would be a silent error.
 * - A nonmetro area counts as wageSource "metro" (the area's own wage, no fallback used);
 *   the area's kind ("msa" / "nonmetro") is kept on the area record for wording.
 */
export function resolveZipWage(cbsa: string, state: string, idx: WageIndex): ZipEntry | null {
  const base = { state, cbsa: cbsa === NON_CBSA ? null : cbsa };

  let area: OewsArea | undefined;
  if (cbsa === NON_CBSA) {
    const nonmetros = idx.nonmetroByState.get(state) ?? [];
    if (nonmetros.length === 1) area = nonmetros[0];
  } else {
    area = idx.byKey.get(`msa:${cbsa}`);
  }
  if (usable(area)) return { ...base, wageArea: area.key, wageSource: "metro" };

  const stateArea = idx.byKey.get(`state:${state}`);
  if (usable(stateArea)) return { ...base, wageArea: stateArea.key, wageSource: "state" };

  const national = idx.byKey.get("national");
  if (usable(national)) return { ...base, wageArea: national.key, wageSource: "national" };

  return null;
}
