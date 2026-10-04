// Buyer coverage per buyerMode (docs/SPEC.md, Coverage). none/manual: the launch rule in
// BuyerConfig (v1: every US ZIP). service_direct: the weekly-synced coverage table (STUB).
import type { CoverageResponse, LeadType } from "@/lib/api/contracts";
import type { BuyerConfig } from "@/lib/buyer/config";

export interface CoverageProvider {
  forZip(zip: string): Promise<CoverageResponse>;
}

const NOT_COVERED: CoverageResponse = { covered: false, leadTypes: [] };

export const isZip = (zip: string) => /^\d{5}$/.test(zip);

/** Lead types offered where covered, primary CTA first; "call" only when a tracking number exists. */
export function leadTypesFor(config: Pick<BuyerConfig, "primaryCta">, trackingNumber: string | null): LeadType[] {
  const types: LeadType[] = trackingNumber ? ["form", "call"] : ["form"];
  return config.primaryCta === "call" && trackingNumber ? ["call", "form"] : types;
}

/** none/manual modes: coverage from the launch rule in config. */
export function configCoverage(config: BuyerConfig): CoverageProvider {
  return {
    async forZip(zip) {
      if (!isZip(zip)) return NOT_COVERED;
      const rule = config.coverage;
      const covered = rule.kind === "all_us" || rule.zips.includes(zip) || rule.zip3.includes(zip.slice(0, 3));
      if (!covered) return NOT_COVERED;
      const out: CoverageResponse = { covered: true, leadTypes: leadTypesFor(config, config.trackingNumber) };
      if (config.trackingNumber) out.trackingNumber = config.trackingNumber;
      return out;
    },
  };
}

/**
 * STUB (Service Direct): the real provider reads the `coverage` table (zip, covered,
 * tracking_number, lead_types, synced_at) filled by /api/cron/coverage-sync. Until Service Direct
 * answers the coverage questions, no ZIP is covered in this mode.
 */
export const serviceDirectCoverageStub: CoverageProvider = {
  async forZip() {
    return NOT_COVERED;
  },
};

/** Never covered; for tests and for estimates computed where coverage doesn't matter. */
export const noCoverage: CoverageProvider = { forZip: async () => NOT_COVERED };

export function coverageProviderFor(config: BuyerConfig): CoverageProvider {
  return config.buyerMode === "service_direct" ? serviceDirectCoverageStub : configCoverage(config);
}
