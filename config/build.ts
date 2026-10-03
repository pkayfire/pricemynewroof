// Config build: merges manual inputs and fetched sources, runs the spec's build checks,
// and writes config/dist/config-vN.json.
//
//   pnpm config:build [--allow-large-changes] [--allow-sample] [--dry-run] [--today=YYYY-MM-DD]
//
// Build checks (docs/SPEC.md, fail the build if any fails):
//   1. Every ZIP in the crosswalk resolves to a wage through the fallback chain.
//   2. No value moves more than 15% from the previous version without an explicit override flag
//      (skipped when there is no previous version).
//   3. No manual input is past its review date.
//   4. PPI base-date values exist for every material series used.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ppiRatio } from "./fetchers/bls_ppi";
import {
  builtConfigSchema,
  hudSourceSchema,
  MANUAL_FILES,
  manualSchema,
  oewsSourceSchema,
  ppiSourceSchema,
  wageSourceOf,
  WAGE_SOURCES,
  type BuiltConfig,
  type HudSource,
  type Manual,
  type OewsSource,
  type PpiFamily,
  type PpiSource,
} from "./lib/schema";
import { indexWages, resolveZipWage } from "./lib/wages";

export const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url));
export const MAX_CHANGE = 0.15;

export interface BuildInputs {
  manual: Manual;
  hud: HudSource;
  oews: OewsSource;
  ppi: PpiSource[];
}

export interface BuildOptions {
  /** YYYY-MM-DD, used for the review-date check. */
  today: string;
  /** ISO timestamp written to the file. */
  builtAt: string;
  previous: BuiltConfig | null;
  allowLargeChanges?: boolean;
  allowSample?: boolean;
}

export interface Change {
  key: string;
  previous: number;
  next: number;
  change: number;
}

export interface BuildStats {
  zipCount: number;
  wageSources: Record<(typeof WAGE_SOURCES)[number], number>;
  unresolvedZips: number;
}

export interface BuildResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  stats: BuildStats;
  largeChanges: Change[];
  /** Present only when ok. */
  config: BuiltConfig | null;
}

// ---------- individual checks (exported for tests) ----------

/** Check 3: every manual file must have today <= reviewDue. */
export function checkReviewDates(manual: Manual, today: string): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(MANUAL_FILES) as (keyof Manual)[]) {
    const { reviewDue, reviewedAt } = manual[key];
    if (today > reviewDue) {
      errors.push(
        `review date passed: config/manual/${MANUAL_FILES[key]} was due for review on ${reviewDue} ` +
          `(last reviewed ${reviewedAt}). Re-check it, then update reviewedAt and reviewDue.`,
      );
    }
  }
  return errors;
}

/** Check 4: each PPI family used by an option needs a value at the base date. */
export function checkPpiBase(manual: Manual, ppi: PpiSource[]): string[] {
  const errors: string[] = [];
  const baseDate = manual.ppiSeries.baseDate;
  if (manual.baseCosts.baseDate !== baseDate) {
    errors.push(`base date mismatch: base_costs.json ${manual.baseCosts.baseDate} vs ppi_series.json ${baseDate}`);
  }
  const used = new Set(Object.values(manual.baseCosts.options).map((o) => o.ppiFamily));
  for (const family of [...used].sort()) {
    const spec = manual.ppiSeries.families[family];
    const src = ppi.find((p) => p.family === family);
    if (!spec) {
      errors.push(`PPI family "${family}" is used by an option but has no series in ppi_series.json`);
    } else if (!src) {
      errors.push(`PPI ${family} (${spec.seriesId}): no fetched source; run pnpm config:fetch --only=ppi`);
    } else if (src.seriesId !== spec.seriesId) {
      errors.push(`PPI ${family}: fetched series ${src.seriesId} does not match ppi_series.json ${spec.seriesId}`);
    } else if (!src.base || src.base.period !== baseDate) {
      errors.push(
        `PPI base-date value missing: ${spec.seriesId} (${family}) has no value for ${baseDate}; ` +
          `latest published is ${src.latest.period}.`,
      );
    }
  }
  return errors;
}

/** Numeric values tracked by the 15% check, keyed by a readable path. */
export function trackedValues(cfg: BuiltConfig): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, o] of Object.entries(cfg.options)) {
    out.set(`options.${id}.low`, o.low);
    out.set(`options.${id}.high`, o.high);
    for (const [k, v] of Object.entries(o.shares)) out.set(`options.${id}.shares.${k}`, v);
  }
  out.set("steepAdder.low", cfg.steepAdder.low);
  out.set("steepAdder.high", cfg.steepAdder.high);
  out.set("permit.percentOfJob", cfg.permit.percentOfJob);
  out.set("permit.min", cfg.permit.min);
  out.set("permit.max", cfg.permit.max);
  for (const [fam, p] of Object.entries(cfg.ppi)) {
    out.set(`ppi.${fam}.baseValue`, p.baseValue);
    out.set(`ppi.${fam}.ratio`, p.ratio);
  }
  for (const [key, a] of Object.entries(cfg.wages.areas)) out.set(`wages.${key}`, a.hourlyMedian);
  // DECISION: also track each ZIP's effective wage, so a ZIP silently moving between wage
  // areas (e.g. metro → state fallback) is caught, not only changes inside one area.
  for (const [zip, [, , area]] of Object.entries(cfg.zips)) {
    const wage = cfg.wages.areas[area]?.hourlyMedian;
    if (wage !== undefined) out.set(`zips.${zip}.wage`, wage);
  }
  return out;
}

/**
 * Check 2: values present in both versions may not move more than maxChange (relative).
 * Values added or removed between versions are not "moves" and are not flagged.
 */
export function findLargeChanges(previous: BuiltConfig, next: BuiltConfig, maxChange = MAX_CHANGE): Change[] {
  const prev = trackedValues(previous);
  const changes: Change[] = [];
  for (const [key, value] of trackedValues(next)) {
    const old = prev.get(key);
    if (old === undefined) continue;
    const change = old === 0 ? (value === 0 ? 0 : Infinity) : Math.abs(value - old) / Math.abs(old);
    if (change > maxChange + 1e-12) changes.push({ key, previous: old, next: value, change });
  }
  return changes.sort((a, b) => b.change - a.change || a.key.localeCompare(b.key));
}

// ---------- checksum ----------

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/**
 * sha256 over the canonical (sorted-key) JSON of the config content, excluding version,
 * builtAt and checksum, so an unchanged rebuild has the same checksum.
 */
export function contentChecksum(cfg: Omit<BuiltConfig, "checksum"> | BuiltConfig): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { version, builtAt, checksum, ...content } = cfg as BuiltConfig;
  return "sha256:" + createHash("sha256").update(JSON.stringify(canonical(content))).digest("hex");
}

// ---------- build ----------

export function buildConfig(inputs: BuildInputs, opts: BuildOptions): BuildResult {
  const { manual, hud, oews, ppi } = inputs;
  const errors: string[] = [];
  const warnings: string[] = [];

  // Sample inputs
  const sampleInputs = [hud, oews, ...ppi].filter((s) => s.sample).map((s) => s.input);
  if (sampleInputs.length && !opts.allowSample) {
    errors.push(
      `sample inputs present (${sampleInputs.join(", ")}); fetch real data or pass --allow-sample ` +
        "for a build marked productionReady: false",
    );
  } else if (sampleInputs.length) {
    warnings.push(`built from SAMPLE inputs (${sampleInputs.join(", ")}): productionReady is false`);
  }

  errors.push(...checkReviewDates(manual, opts.today));
  errors.push(...checkPpiBase(manual, ppi));

  // Check 1: ZIP → wage
  const idx = indexWages(oews.value);
  const stats: BuildStats = { zipCount: 0, wageSources: { metro: 0, state: 0, national: 0 }, unresolvedZips: 0 };
  const zips: BuiltConfig["zips"] = {};
  const usedAreas = new Set<string>();
  const unresolved: string[] = [];
  for (const zip of Object.keys(hud.value).sort()) {
    const [cbsa, state] = hud.value[zip];
    stats.zipCount++;
    const entry = resolveZipWage(cbsa, state, idx);
    if (!entry) {
      unresolved.push(zip);
      continue;
    }
    stats.wageSources[entry.wageSource]++;
    usedAreas.add(entry.wageArea);
    zips[zip] = [entry.state, entry.cbsa, entry.wageArea];
  }
  stats.unresolvedZips = unresolved.length;
  if (unresolved.length) {
    errors.push(
      `${unresolved.length} ZIPs do not resolve to a wage (no usable metro, state or national wage), ` +
        `e.g. ${unresolved.slice(0, 5).join(", ")}`,
    );
  }

  if (errors.length) return { ok: false, errors, warnings, stats, largeChanges: [], config: null };

  // Merge
  const areas: BuiltConfig["wages"]["areas"] = {};
  for (const key of [...usedAreas, "national"].sort()) {
    const a = idx.byKey.get(key)!;
    areas[key] = { kind: a.kind, title: a.title, name: a.name, state: a.state, hourlyMedian: a.hourlyMedian! };
  }

  const ppiOut = {} as BuiltConfig["ppi"];
  for (const p of ppi) {
    if (!p.base) continue; // only possible for unused families (checkPpiBase passed)
    ppiOut[p.family as PpiFamily] = {
      seriesId: p.seriesId,
      title: p.title,
      sourceUrl: p.sourceUrl,
      basePeriod: p.base.period,
      baseValue: p.base.value,
      latestPeriod: p.latest.period,
      latestValue: p.latest.value,
      ratio: ppiRatio(p.latest.value, p.base.value),
    };
  }

  const options = Object.fromEntries(
    Object.entries(manual.baseCosts.options).map(([id, o]) => [
      id,
      {
        name: o.name,
        low: o.low,
        high: o.high,
        shares: o.shares,
        confidence: o.confidence,
        ppiFamily: o.ppiFamily,
        sources: o.sources,
      },
    ]),
  ) as BuiltConfig["options"];

  const manualInputs = (Object.keys(MANUAL_FILES) as (keyof Manual)[]).map((k) => ({
    input: `manual/${MANUAL_FILES[k]}`,
    sourceUrl: `config/manual/${MANUAL_FILES[k]}`,
    retrievedAt: manual[k].reviewedAt,
    sample: false,
    detail: `reviewDue ${manual[k].reviewDue}`,
  }));

  const draft: Omit<BuiltConfig, "checksum"> = {
    schemaVersion: 1,
    version: (opts.previous?.version ?? 0) + 1,
    builtAt: opts.builtAt,
    productionReady: sampleInputs.length === 0,
    sampleInputs,
    overrides: { allowLargeChanges: !!opts.allowLargeChanges, largeChangeCount: 0 },
    inputs: [
      ...manualInputs,
      {
        input: hud.input,
        sourceUrl: hud.sourceUrl,
        retrievedAt: hud.retrievedAt,
        sample: hud.sample,
        detail: `${hud.year} Q${hud.quarter}`,
      },
      {
        input: oews.input,
        sourceUrl: oews.sourceUrl,
        retrievedAt: oews.retrievedAt,
        sample: oews.sample,
        detail: oews.sample ? `SAMPLE, not BLS data: ${oews.release}` : oews.release,
      },
      ...ppi.map((p) => ({
        input: p.input,
        sourceUrl: p.sourceUrl,
        retrievedAt: p.retrievedAt,
        sample: p.sample,
        detail: p.seriesId,
      })),
    ],
    baseDate: manual.baseCosts.baseDate,
    options,
    steepAdder: { low: manual.steepAdder.low, high: manual.steepAdder.high },
    permit: {
      percentOfJob: manual.permit.percentOfJob,
      min: manual.permit.min,
      max: manual.permit.max,
      label: manual.permit.label,
    },
    tileStates: [...manual.tileStates.states].sort(),
    ppi: ppiOut,
    wages: { occupation: "47-2181", release: oews.release, nationalArea: "national", areas },
    hud: { year: hud.year, quarter: hud.quarter },
    zips,
  };

  // Check 2: 15% moves (skipped on the first build)
  let largeChanges: Change[] = [];
  if (opts.previous) {
    largeChanges = findLargeChanges(opts.previous, { ...draft, checksum: "" } as BuiltConfig);
    if (largeChanges.length && !opts.allowLargeChanges) {
      const shown = largeChanges
        .slice(0, 10)
        .map((c) => `${c.key}: ${c.previous} → ${c.next} (${(c.change * 100).toFixed(1)}%)`);
      errors.push(
        `${largeChanges.length} values moved more than ${MAX_CHANGE * 100}% from v${opts.previous.version}; ` +
          `review them and rerun with --allow-large-changes:\n    ${shown.join("\n    ")}` +
          (largeChanges.length > 10 ? `\n    …and ${largeChanges.length - 10} more` : ""),
      );
      return { ok: false, errors, warnings, stats, largeChanges, config: null };
    }
    draft.overrides.largeChangeCount = largeChanges.length;
  } else {
    warnings.push("no previous config version: 15% change check skipped (first build)");
  }

  const config = builtConfigSchema.parse({ ...draft, checksum: contentChecksum(draft) });
  return { ok: true, errors, warnings, stats, largeChanges, config };
}

// ---------- file I/O ----------

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadManual(dir = path.join(CONFIG_DIR, "manual")): Manual {
  const raw = Object.fromEntries(
    Object.entries(MANUAL_FILES).map(([k, f]) => [k, readJson(path.join(dir, f))]),
  );
  return manualSchema.parse(raw);
}

export function loadSources(manual: Manual, dir = path.join(CONFIG_DIR, "sources")) {
  const hud = hudSourceSchema.parse(readJson(path.join(dir, "hud_zip_cbsa.json")));
  const oews = oewsSourceSchema.parse(readJson(path.join(dir, "oews_47-2181.json")));
  const ppi = (Object.keys(manual.ppiSeries.families) as PpiFamily[])
    .map((f) => path.join(dir, `ppi_${f}.json`))
    .filter((f) => fs.existsSync(f))
    .map((f) => ppiSourceSchema.parse(readJson(f)));
  return { hud, oews, ppi };
}

/** Highest-numbered config-vN.json in dist, or null. */
export function loadPrevious(distDir = path.join(CONFIG_DIR, "dist")): BuiltConfig | null {
  if (!fs.existsSync(distDir)) return null;
  const versions = fs
    .readdirSync(distDir)
    .map((f) => /^config-v(\d+)\.json$/.exec(f))
    .filter((m) => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a);
  if (!versions.length) return null;
  return builtConfigSchema.parse(readJson(path.join(distDir, `config-v${versions[0]}.json`)));
}

function main(argv: string[]): number {
  const flag = (name: string) => argv.includes(`--${name}`);
  const todayArg = argv.find((a) => a.startsWith("--today="))?.slice(8);
  const now = new Date();
  const today = todayArg ?? now.toISOString().slice(0, 10);

  const manual = loadManual();
  const sources = loadSources(manual);
  const previous = loadPrevious();
  const result = buildConfig(
    { manual, ...sources },
    {
      today,
      builtAt: now.toISOString(),
      previous,
      allowLargeChanges: flag("allow-large-changes"),
      allowSample: flag("allow-sample"),
    },
  );

  const s = result.stats;
  console.log(
    `ZIPs: ${s.zipCount} (wage via metro ${s.wageSources.metro}, state ${s.wageSources.state}, ` +
      `national ${s.wageSources.national}, unresolved ${s.unresolvedZips})`,
  );
  for (const w of result.warnings) console.warn(`warning: ${w}`);
  if (!result.ok || !result.config) {
    for (const e of result.errors) console.error(`build check failed: ${e}`);
    console.error("Build failed; nothing written.");
    return 1;
  }

  const cfg = result.config;
  if (previous && previous.checksum === cfg.checksum) {
    console.log(`No change from v${previous.version} (checksum ${cfg.checksum}); nothing written.`);
    return 0;
  }
  const out = path.join(CONFIG_DIR, "dist", `config-v${cfg.version}.json`);
  const body = JSON.stringify(cfg) + "\n";
  if (flag("dry-run")) {
    console.log(`Dry run: would write ${path.relative(process.cwd(), out)} (${body.length} bytes)`);
    return 0;
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, body);
  console.log(`Wrote ${path.relative(process.cwd(), out)} (${body.length} bytes, ${cfg.checksum})`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
