// Typed schemas for every config input (manual + fetched sources) and for the
// built config file. build.ts validates everything against these.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, "expected YYYY-MM");
const url = z.string().url();
const share = z.number().min(0).max(1);

// ---------- manual inputs (config/manual/*.json) ----------

/** Every manual file carries its review dates; the build fails past reviewDue. */
const reviewed = {
  reviewedAt: isoDate,
  reviewDue: isoDate,
};

export const OPTION_IDS = ["architectural_shingle", "concrete_tile", "lift_and_relay"] as const;
export const optionIdSchema = z.enum(OPTION_IDS);
export type OptionId = z.infer<typeof optionIdSchema>;

export const PPI_FAMILIES = ["asphalt", "concrete"] as const;
export const ppiFamilySchema = z.enum(PPI_FAMILIES);
export type PpiFamily = z.infer<typeof ppiFamilySchema>;

export const baseCostSourceSchema = z.object({
  name: z.string().min(1),
  url,
  publishedLow: z.number().positive(),
  publishedHigh: z.number().positive(),
  note: z.string().optional(),
  pageDate: z.string().min(1),
  retrievedAt: isoDate,
});

export const baseCostOptionSchema = z
  .object({
    name: z.string().min(1),
    low: z.number().positive(),
    high: z.number().positive(),
    shares: z.object({ labor: share, material: share, other: share }),
    confidence: z.enum(["high", "medium", "low"]),
    ppiFamily: ppiFamilySchema,
    note: z.string().optional(),
    sources: z.array(baseCostSourceSchema).min(1),
  })
  .refine((o) => o.low <= o.high, "low must be <= high")
  .refine(
    (o) => Math.abs(o.shares.labor + o.shares.material + o.shares.other - 1) < 1e-9,
    "shares must sum to 1",
  );

export const baseCostsSchema = z.object({
  ...reviewed,
  baseDate: yearMonth,
  unit: z.string(),
  options: z.record(optionIdSchema, baseCostOptionSchema),
});

export const tileStatesSchema = z.object({
  ...reviewed,
  source: z.string(),
  states: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1),
});

export const permitSchema = z
  .object({
    ...reviewed,
    source: z.string(),
    percentOfJob: z.number().gt(0).lt(1),
    min: z.number().nonnegative(),
    max: z.number().positive(),
    label: z.string(),
  })
  .refine((p) => p.min <= p.max, "min must be <= max");

export const steepAdderSchema = z
  .object({
    ...reviewed,
    source: z.string(),
    unit: z.string(),
    low: z.number().nonnegative(),
    high: z.number().nonnegative(),
  })
  .refine((s) => s.low <= s.high, "low must be <= high");

export const ppiSeriesManualSchema = z.object({
  ...reviewed,
  baseDate: yearMonth,
  families: z.record(
    ppiFamilySchema,
    z.object({ seriesId: z.string().min(1), title: z.string(), sourceUrl: url }),
  ),
});

export const manualSchema = z.object({
  baseCosts: baseCostsSchema,
  tileStates: tileStatesSchema,
  permit: permitSchema,
  steepAdder: steepAdderSchema,
  ppiSeries: ppiSeriesManualSchema,
});
export type Manual = z.infer<typeof manualSchema>;

/** Map of manual file name → key in Manual. */
export const MANUAL_FILES = {
  baseCosts: "base_costs.json",
  tileStates: "tile_states.json",
  permit: "permit.json",
  steepAdder: "steep_adder.json",
  ppiSeries: "ppi_series.json",
} as const satisfies Record<keyof Manual, string>;

// ---------- fetched sources (config/sources/*.json) ----------

const sourceMeta = {
  input: z.string(),
  sourceUrl: url,
  retrievedAt: isoDate,
  /**
   * True when built from a hand-made sample rather than a real download. A build only
   * accepts sample inputs with --allow-sample, and then marks itself productionReady: false.
   */
  sample: z.boolean().default(false),
  note: z.string().optional(),
};

/** ZIP → [cbsa, state]. cbsa "99999" = not in any CBSA. */
export const hudSourceSchema = z.object({
  ...sourceMeta,
  input: z.literal("hud_zip_cbsa"),
  year: z.string(),
  quarter: z.string(),
  value: z.record(z.string().regex(/^\d{5}$/), z.tuple([z.string().regex(/^\d{5}$/), z.string().regex(/^[A-Z]{2}$/)])),
});
export type HudSource = z.infer<typeof hudSourceSchema>;

export const OEWS_AREA_KINDS = ["national", "state", "msa", "nonmetro"] as const;
export const oewsAreaSchema = z.object({
  key: z.string(),
  kind: z.enum(OEWS_AREA_KINDS),
  code: z.string(),
  title: z.string(),
  name: z.string(),
  state: z.string().nullable(),
  /** Roofers (47-2181) median hourly wage; null when suppressed or not published. */
  hourlyMedian: z.number().positive().nullable(),
  /** "ok", "suppressed" (with the BLS marker, e.g. "*" or "#"), or "not_published" (area has no roofer row). */
  status: z.enum(["ok", "suppressed", "not_published"]),
  marker: z.string().nullable(),
});
export type OewsArea = z.infer<typeof oewsAreaSchema>;

export const oewsSourceSchema = z.object({
  ...sourceMeta,
  input: z.literal("oews_47-2181"),
  occupation: z.literal("47-2181"),
  release: z.string(),
  value: z.array(oewsAreaSchema),
});
export type OewsSource = z.infer<typeof oewsSourceSchema>;

const ppiPoint = z.object({ period: yearMonth, value: z.number().positive(), preliminary: z.boolean() });
export const ppiSourceSchema = z.object({
  ...sourceMeta,
  input: z.string().regex(/^ppi_/),
  family: ppiFamilySchema,
  seriesId: z.string(),
  title: z.string(),
  baseDate: yearMonth,
  base: ppiPoint.nullable(),
  latest: ppiPoint,
  value: z.number().positive(),
});
export type PpiSource = z.infer<typeof ppiSourceSchema>;

// ---------- built config (config/dist/config-vN.json) ----------

export const WAGE_SOURCES = ["metro", "state", "national"] as const;

export const wageAreaSchema = z.object({
  kind: z.enum(OEWS_AREA_KINDS),
  title: z.string(),
  name: z.string(),
  state: z.string().nullable(),
  hourlyMedian: z.number().positive(),
});

/** Result of resolving one ZIP through the wage fallback chain (build-time only). */
export const zipEntrySchema = z.object({
  state: z.string(),
  cbsa: z.string().nullable(),
  wageArea: z.string(),
  wageSource: z.enum(WAGE_SOURCES),
});
export type ZipEntry = z.infer<typeof zipEntrySchema>;

/**
 * Compact ZIP row in the built config: [state, cbsa or null, wage area key].
 * wageSource is derived from the wage area's kind (see wageSourceOf), which keeps
 * the ~40k-ZIP table small.
 */
export const builtZipSchema = z.tuple([
  z.string().regex(/^[A-Z]{2}$/),
  z.string().regex(/^\d{5}$/).nullable(),
  z.string(),
]);

export function wageSourceOf(kind: (typeof OEWS_AREA_KINDS)[number]): (typeof WAGE_SOURCES)[number] {
  if (kind === "state") return "state";
  if (kind === "national") return "national";
  return "metro"; // msa or nonmetro: the area's own wage, no fallback
}

export const builtConfigSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().positive(),
  builtAt: z.string(),
  checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  /** False when any input is a hand-made sample. The engine must refuse such a config in production. */
  productionReady: z.boolean(),
  sampleInputs: z.array(z.string()),
  overrides: z.object({
    allowLargeChanges: z.boolean(),
    largeChangeCount: z.number().int().nonnegative(),
  }),
  inputs: z.array(
    z.object({
      input: z.string(),
      sourceUrl: z.string(),
      retrievedAt: z.string(),
      sample: z.boolean(),
      detail: z.string().optional(),
    }),
  ),
  baseDate: yearMonth,
  options: z.record(
    optionIdSchema,
    z.object({
      name: z.string(),
      low: z.number(),
      high: z.number(),
      shares: z.object({ labor: share, material: share, other: share }),
      confidence: z.enum(["high", "medium", "low"]),
      ppiFamily: ppiFamilySchema,
      sources: z.array(baseCostSourceSchema),
    }),
  ),
  steepAdder: z.object({ low: z.number(), high: z.number() }),
  permit: z.object({ percentOfJob: z.number(), min: z.number(), max: z.number(), label: z.string() }),
  tileStates: z.array(z.string()),
  ppi: z.record(
    ppiFamilySchema,
    z.object({
      seriesId: z.string(),
      title: z.string(),
      sourceUrl: url,
      basePeriod: yearMonth,
      baseValue: z.number().positive(),
      latestPeriod: yearMonth,
      latestValue: z.number().positive(),
      ratio: z.number().positive(),
    }),
  ),
  wages: z.object({
    occupation: z.literal("47-2181"),
    release: z.string(),
    nationalArea: z.literal("national"),
    areas: z.record(z.string(), wageAreaSchema),
  }),
  hud: z.object({ year: z.string(), quarter: z.string() }),
  zips: z.record(z.string().regex(/^\d{5}$/), builtZipSchema),
});
export type BuiltConfig = z.infer<typeof builtConfigSchema>;
