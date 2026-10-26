import { describe, expect, it } from "vitest";
import { DEFAULT_LANDING_HEADLINE, LANDING_CTA, LANDING_HINT, LANDING_LEDE, landingHeadline } from "@/lib/site/landing-copy";

describe("landingHeadline", () => {
  it("uses the default headline for cost-research", () => {
    expect(landingHeadline("cost-research")).toBe("See what a new roof should cost for your house");
  });

  it("matches the repair-or-replace ad group", () => {
    expect(landingHeadline("repair-or-replace")).toBe("Thinking about replacing your roof? See what it would cost first.");
  });

  it("matches the tile-roofs ad group", () => {
    expect(landingHeadline("tile-roofs")).toBe("Keep your tiles or replace them? Compare the costs for your roof.");
  });

  it("matches the ready-to-replace ad group", () => {
    expect(landingHeadline("ready-to-replace")).toBe("Replacing your roof? Know what it should cost before you hire a roofer.");
  });

  it("falls back to the default when the param is missing or empty", () => {
    expect(landingHeadline(undefined)).toBe(DEFAULT_LANDING_HEADLINE);
    expect(landingHeadline("")).toBe(DEFAULT_LANDING_HEADLINE);
  });

  it("falls back to the default for unknown values", () => {
    expect(landingHeadline("roof-cost-phx")).toBe(DEFAULT_LANDING_HEADLINE);
    expect(landingHeadline("toString")).toBe(DEFAULT_LANDING_HEADLINE);
    expect(landingHeadline("__proto__")).toBe(DEFAULT_LANDING_HEADLINE);
  });

  it("accepts only exact slugs, not other cases or padding", () => {
    expect(landingHeadline("Tile-Roofs")).toBe(DEFAULT_LANDING_HEADLINE);
    expect(landingHeadline("REPAIR-OR-REPLACE")).toBe(DEFAULT_LANDING_HEADLINE);
    expect(landingHeadline(" tile-roofs")).toBe(DEFAULT_LANDING_HEADLINE);
  });
});

describe("landing copy", () => {
  it("uses the approved supporting line, button and hint", () => {
    expect(LANDING_LEDE).toBe(
      "Enter your address to get a price range for your roof in a few seconds, measured from satellite imagery and priced with local labor costs.",
    );
    expect(LANDING_CTA).toBe("See my price");
    expect(LANDING_HINT).toBe("Free, and no phone number or email needed. We only use your address to find your roof.");
  });

  it("does not call the estimate a quote or use arrows or middle dots", () => {
    for (const s of [LANDING_LEDE, LANDING_CTA, LANDING_HINT, landingHeadline("repair-or-replace"), landingHeadline("tile-roofs")]) {
      expect(s).not.toMatch(/quote/i);
      expect(s).not.toMatch(/[→←·]/);
    }
  });
});
