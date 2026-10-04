// Buyer configuration (docs/SPEC.md, Coverage, leads and calls → Buyer mode). Switching to
// Service Direct later is a config change here plus the integration, not a UI rewrite.
import { BUYER_MODES, PRIMARY_CTAS, type BuyerMode, type PrimaryCta } from "@/lib/api/contracts";

export type CoverageRule =
  /** Every valid US ZIP is covered (v1: open coverage; ad geo targeting decides where traffic comes from). */
  | { kind: "all_us" }
  /** Launch allowlist of ZIPs and/or 3-digit ZIP prefixes. */
  | { kind: "allowlist"; zips: string[]; zip3: string[] };

export interface BuyerConfig {
  buyerMode: BuyerMode;
  primaryCta: PrimaryCta;
  /** Used in none/manual modes; service_direct reads the synced coverage table instead. */
  coverage: CoverageRule;
  /** Call tracking number (E.164). The call button is hidden unless one exists. */
  trackingNumber: string | null;
}

/** v1 (Build decisions, Leads): manual forwarding, quote form first, open coverage, no call number. */
export const BUYER_CONFIG: BuyerConfig = {
  buyerMode: "manual",
  primaryCta: "form",
  coverage: { kind: "all_us" },
  trackingNumber: null,
};

/**
 * DECISION: BUYER_MODE and PRIMARY_CTA env vars may override the code default (e.g. BUYER_MODE=none
 * for local testing). An invalid value throws rather than silently falling back.
 */
export function buyerConfigFromEnv(env: NodeJS.ProcessEnv = process.env, base: BuyerConfig = BUYER_CONFIG): BuyerConfig {
  const mode = env.BUYER_MODE?.trim();
  const cta = env.PRIMARY_CTA?.trim();
  if (mode && !(BUYER_MODES as readonly string[]).includes(mode)) throw new Error(`BUYER_MODE must be one of ${BUYER_MODES.join(", ")}`);
  if (cta && !(PRIMARY_CTAS as readonly string[]).includes(cta)) throw new Error(`PRIMARY_CTA must be one of ${PRIMARY_CTAS.join(", ")}`);
  const config = { ...base, buyerMode: (mode as BuyerMode) || base.buyerMode, primaryCta: (cta as PrimaryCta) || base.primaryCta };
  if (config.buyerMode === "none" && env.VERCEL_ENV === "production") {
    // The form promises quotes; never run ads in this mode (spec).
    console.warn("[buyer] BUYER_MODE=none in production: leads are held and never forwarded");
  }
  return config;
}
