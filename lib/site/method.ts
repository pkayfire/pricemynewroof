// Facts for the "How we estimate" page, read from the pinned config file at build time so the page
// always matches what the engine uses.
// MERGE NOTE: Milestone 2 adds lib/config/load.ts; switch to it (and its pinned version) at merge.
import { readFileSync } from "node:fs";
import path from "node:path";

// DECISION: the page reads config-v1 until Milestone 2's config loader (version pinning) lands.
export const METHOD_CONFIG_VERSION = 1;

interface Source {
  name: string;
  url: string;
  publishedLow: number;
  publishedHigh: number;
  note?: string;
  pageDate: string;
  retrievedAt: string;
}
interface OptionCfg {
  name: string;
  low: number;
  high: number;
  shares: { labor: number; material: number; other: number };
  confidence: string;
  ppiFamily: "asphalt" | "concrete";
  sources: Source[];
}
interface PpiCfg {
  seriesId: string;
  sourceUrl: string;
  basePeriod: string;
  baseValue: number;
  latestPeriod: string;
  latestValue: number;
}
interface ConfigSlice {
  version: number;
  builtAt: string;
  baseDate: string;
  options: Record<"architectural_shingle" | "concrete_tile" | "lift_and_relay", OptionCfg>;
  steepAdder: { low: number; high: number };
  permit: { percentOfJob: number; min: number; max: number; label: string };
  tileStates: string[];
  ppi: Record<"asphalt" | "concrete", PpiCfg>;
  wages: { occupation: string; release: string };
  hud: { year: string; quarter: string };
}

export type MethodFacts = ConfigSlice;

export function loadMethodFacts(): MethodFacts {
  const file = path.join(process.cwd(), "config", "dist", `config-v${METHOD_CONFIG_VERSION}.json`);
  const c = JSON.parse(readFileSync(file, "utf8")) as ConfigSlice;
  return {
    version: c.version,
    builtAt: c.builtAt,
    baseDate: c.baseDate,
    options: c.options,
    steepAdder: c.steepAdder,
    permit: c.permit,
    tileStates: c.tileStates,
    ppi: c.ppi,
    wages: { occupation: c.wages.occupation, release: c.wages.release },
    hud: { year: c.hud.year, quarter: c.hud.quarter },
  };
}
