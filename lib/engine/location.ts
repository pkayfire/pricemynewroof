// ZIP → CBSA → wage area via the built config. Pure (reads only the config object).
import { wageSourceOf } from "@/config/lib/schema";
import type { BuiltConfig, LocationFactors } from "./types";

export class LocationError extends Error {}

/**
 * Resolves the wage area for a ZIP. A ZIP the config knows uses its precomputed fallback
 * chain (metro → state → national). A ZIP missing from the config (new or PO-box-only ZIPs)
 * falls back to the state wage from the address, then national.
 */
export function resolveLocationFactors(zip: string, addressState: string, config: BuiltConfig): LocationFactors {
  const areas = config.wages.areas;
  const national = areas[config.wages.nationalArea];
  if (!national) throw new LocationError("config has no national wage area");

  const row = config.zips[zip];
  let wageAreaKey: string;
  let state: string;
  let cbsa: string | null = null;
  if (row) {
    [state, cbsa, wageAreaKey] = row;
  } else {
    state = addressState.toUpperCase();
    wageAreaKey = areas[`state:${state}`] ? `state:${state}` : config.wages.nationalArea;
  }
  const area = areas[wageAreaKey];
  if (!area) throw new LocationError(`config has no wage area ${wageAreaKey}`);

  return {
    zip,
    state,
    cbsa,
    wageAreaKey,
    areaKind: area.kind,
    areaName: area.name,
    wageSource: wageSourceOf(area.kind),
    areaWage: area.hourlyMedian,
    nationalWage: national.hourlyMedian,
  };
}
