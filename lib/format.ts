// Pure display helpers for estimate data. Location text is always generated from data.
import type { CurrentRoof, Drivers, EstimateOption, Fallback, WageSource } from "@/lib/api/types";
import { WIDENING } from "@/lib/engine/estimate";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export const formatUsd = (n: number) => usd.format(n);
export const formatRange = (low: number, high: number) => `${formatUsd(low)}–${formatUsd(high)}`;
export const formatSqft = (n: number) => `${int.format(Math.round(n))} sq ft`;
export const formatSquares = (n: number) => oneDecimal.format(n);
export const formatInt = (n: number) => int.format(n);
/** 0.59 → "59%" */
export const formatShare = (share: number) => `${Math.round(Math.abs(share) * 100)}%`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2025-06-14" → "June 14, 2025"; "2025-06" → "June 2025"; anything else is returned as is. */
export function formatImageryDate(date: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(date);
  if (!m) return date;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return date;
  return m[3] ? `${month} ${Number(m[3])}, ${m[1]}` : `${month} ${m[1]}`;
}

const COMPASS = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];

/** Nearest of 8 compass directions for an azimuth in degrees clockwise from north. */
export function compassFromAzimuth(azimuth: number): string {
  const i = Math.round((((azimuth % 360) + 360) % 360) / 45) % 8;
  return COMPASS[i];
}

const COMPASS_NAMES: Record<string, string> = {
  N: "North", NE: "Northeast", E: "East", SE: "Southeast", S: "South", SW: "Southwest", W: "West", NW: "Northwest",
};

/** The engine reports "N", "NE"…; the table says "North", "Northeast"…; null means a flat plane. */
export function compassName(compass: string | null, azimuth: number): string {
  if (compass === null) return "Flat";
  return COMPASS_NAMES[compass] ?? (COMPASS.includes(compass) ? compass : compassFromAzimuth(azimuth));
}

/** "For the {areaName} area." / "For homes in {state}." / "Based on national averages." (Build decisions) */
export function locationText(areaName: string, wageSource: WageSource): string {
  switch (wageSource) {
    case "metro":
      return `For the ${areaName} area.`;
    case "state":
      return `For homes in ${areaName}.`;
    case "national":
      return "Based on national averages.";
  }
}

/** The line under the sheet heading. The "not a quote" disclosure is in the site footer (Oct 14). */
export function sheetSubtitle(drivers: Pick<Drivers, "areaName" | "wageSource">): string {
  return locationText(drivers.areaName, drivers.wageSource);
}

export const CURRENT_ROOF_LABELS: Record<CurrentRoof, string> = {
  shingle: "Asphalt shingle",
  tile: "Tile",
  metal: "Metal",
  not_sure: "Not sure",
};

/** Plain-language reasons behind each fallback, for the notes on the estimate sheet. */
export function fallbackReason(f: Fallback): string {
  switch (f) {
    case "home_size":
      return "we estimated the roof from your home's size, not satellite measurements";
    case "imagery_medium":
      return "the satellite imagery for this roof is medium resolution";
    case "imagery_low":
      return "the satellite imagery for this roof is low resolution";
    case "imagery_old":
      return "the satellite imagery for this home is several years old";
    case "size_confirmed":
      return "you confirmed a roof outside the usual size for a house";
    case "building_confirmed":
      return "you confirmed a building set back from the address";
    case "wage_state":
      return "local roofer wages aren't published for your area, so labor uses your state's figure";
    case "wage_national":
      return "local roofer wages aren't available for your area, so labor uses the national figure";
  }
}

/** How much the engine widened the ranges, from its own table (widenings add up). */
export function wideningOf(fallbacks: Fallback[]): number {
  return fallbacks.reduce((acc, f) => acc + WIDENING[f], 0);
}

/** "Each range is 20% wider because …", or null when nothing widened the range. */
export function wideningNote(fallbacks: Fallback[]): string | null {
  const widening = fallbacks.filter((f) => WIDENING[f] > 0);
  if (!widening.length) return null;
  const pct = Math.round(wideningOf(fallbacks) * 100);
  return `Each range is ${pct}% wider because ${widening.map(fallbackReason).join(", and ")}.`;
}

/** Old imagery lowers confidence without widening (owner decision); say how old it is. */
export function oldImageryNote(fallbacks: Fallback[], imageryDate: string | null): string | null {
  if (!fallbacks.includes("imagery_old")) return null;
  const year = imageryDate?.slice(0, 4);
  return year
    ? `Satellite imagery for this home is from ${year}; recent changes may not show.`
    : "Satellite imagery for this home is several years old; recent changes may not show.";
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Narrow $25,000-$41,500 to one price" from the first option; the v2 heading if there's no option. */
export function callPitchHeading(first: Pick<EstimateOption, "low" | "high"> | undefined): string {
  return first ? `Narrow ${formatRange(first.low, first.high)} to one price` : "Want an exact price?";
}
