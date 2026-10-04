// Explanation validator (docs/SPEC.md "Explanation service" → Validation). All checks must pass,
// otherwise the deterministic template is used.
import type { Drivers } from "@/lib/api/types";
import { extractNumbers } from "./numbers";

export const MAX_CHARS = 400;
export const MIN_SENTENCES = 2;
export const MAX_SENTENCES = 3;
export const MAX_LATENCY_MS = 1500;

export const BANNED_TERMS: ReadonlyArray<{ term: string; re: RegExp }> = [
  { term: "guaranteed", re: /\bguarantee/i },
  { term: "exact", re: /\bexact/i },
  { term: "promise", re: /\bpromis/i },
  { term: "best price", re: /\bbest\s+price/i },
  { term: "cheapest", re: /\bcheapest\b/i },
];

export interface ValidationResult {
  ok: boolean;
  failures: string[];
}

/**
 * Values in the drivers object: counts and areas (squares, sections), shares as fractions
 * (0.3) and the same shares as percentages (30).
 */
function allowedValues(d: Drivers): { counts: number[]; shares: number[]; percent: number[] } {
  const shareLike = [
    d.steepShare,
    d.laborVsNational,
    d.materialTrendSinceBase,
    d.shares.labor,
    d.shares.materials,
    d.shares.other,
  ].map(Math.abs);
  return {
    counts: [d.squares, ...(d.sections === null ? [] : [d.sections])],
    shares: shareLike,
    percent: shareLike.map((v) => v * 100),
  };
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Exact, rounded to one decimal, or a whole number within 1 (rounded up or down). */
function matches(n: number, v: number): boolean {
  const eps = 1e-9;
  if (Math.abs(n - v) < eps) return true;
  if (Math.abs(n - round1(v)) < eps) return true;
  if (Number.isInteger(n) && Math.abs(n - v) < 1) return true;
  return false;
}

/** A share written as a decimal ("0.3") must match to two places. */
const matchesShare = (n: number, v: number) => Math.abs(n - v) < 0.005 + 1e-9;

/** Fractions written in words ("half", "a third") match a share within 5 points. */
function matchesFraction(n: number, shares: number[]): boolean {
  return shares.some((v) => Math.abs(n - v) <= 0.05);
}

export function countSentences(text: string): number {
  const normalized = text.replace(/\bU\.S\./g, "US").trim();
  if (!normalized) return 0;
  return normalized.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function validateExplanation(text: string, drivers: Drivers, latencyMs = 0): ValidationResult {
  const failures: string[] = [];
  const trimmed = text.trim();

  if (!trimmed) failures.push("empty");
  if (trimmed.length > MAX_CHARS) failures.push(`too long (${trimmed.length} > ${MAX_CHARS} chars)`);

  const sentences = countSentences(trimmed);
  if (sentences < MIN_SENTENCES || sentences > MAX_SENTENCES) failures.push(`sentences: ${sentences}`);
  if (trimmed && !/[.!?]$/.test(trimmed)) failures.push("unfinished sentence");

  for (const { term, re } of BANNED_TERMS) if (re.test(trimmed)) failures.push(`banned term: ${term}`);

  if (/[$€£]/.test(trimmed) || /\bdollars?\b/i.test(trimmed)) failures.push("mentions money");

  if (latencyMs > MAX_LATENCY_MS) failures.push(`slow: ${latencyMs} ms`);

  // Numbers: the area name may contain digits or number words; drop it before scanning.
  let scan = trimmed;
  if (drivers.areaName) scan = scan.replace(new RegExp(escapeRegExp(drivers.areaName), "gi"), " ");
  const { numbers, pitches } = extractNumbers(scan);
  const allowed = allowedValues(drivers);
  const maxRise = drivers.maxPitch ? Number(drivers.maxPitch.split("/")[0]) : null;

  for (const rise of pitches) {
    if (rise !== maxRise) failures.push(`pitch not in drivers: ${rise}/12`);
  }
  for (const n of numbers) {
    let ok: boolean;
    if (n.percent) ok = allowed.percent.some((v) => matches(n.value, v));
    else if (n.value > 0 && n.value < 1)
      ok = /\d/.test(n.raw)
        ? allowed.shares.some((v) => matchesShare(n.value, v))
        : matchesFraction(n.value, allowed.shares);
    else ok = allowed.counts.some((v) => matches(n.value, v));
    if (!ok) failures.push(`number not in drivers: ${n.raw}`);
  }

  return { ok: failures.length === 0, failures };
}
