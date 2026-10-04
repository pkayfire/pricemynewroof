// Buyer coverage behind an interface. Milestone 4 replaces the stub with the launch allowlist
// (manual mode) or the Service Direct coverage table.
import type { Coverage } from "./types";

export interface CoverageProvider {
  forZip(zip: string): Promise<Coverage>;
}

/** STUB (Milestone 4): no ZIP is covered yet. */
export const stubCoverage: CoverageProvider = {
  async forZip() {
    return { covered: false, leadTypes: [] };
  },
};
