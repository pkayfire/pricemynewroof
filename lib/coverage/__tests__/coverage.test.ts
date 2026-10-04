import { describe, expect, it } from "vitest";
import { handleCoverageGet } from "@/lib/coverage/http";
import { BUYER_CONFIG, buyerConfigFromEnv, type BuyerConfig } from "@/lib/buyer/config";
import { configCoverage, coverageProviderFor, leadTypesFor } from "@/lib/coverage";

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const cfg = (over: Partial<BuyerConfig> = {}): BuyerConfig => ({ ...BUYER_CONFIG, ...over });

describe("coverage", () => {
  it("v1 default: manual mode, form CTA, every US ZIP covered with no tracking number", async () => {
    expect(BUYER_CONFIG).toMatchObject({ buyerMode: "manual", primaryCta: "form", coverage: { kind: "all_us" }, trackingNumber: null });
    const p = coverageProviderFor(BUYER_CONFIG);
    for (const zip of ["85032", "02108", "99501", "00601"]) {
      expect(await p.forZip(zip)).toEqual({ covered: true, leadTypes: ["form"] });
    }
    expect(await p.forZip("8503")).toEqual({ covered: false, leadTypes: [] });
  });

  it("allowlist mode covers listed ZIPs and ZIP3 prefixes only", async () => {
    const p = configCoverage(cfg({ coverage: { kind: "allowlist", zips: ["85032"], zip3: ["926"] } }));
    expect((await p.forZip("85032")).covered).toBe(true);
    expect((await p.forZip("92680")).covered).toBe(true);
    expect(await p.forZip("10001")).toEqual({ covered: false, leadTypes: [] });
  });

  it("offers a call only when a tracking number exists, primary CTA first", async () => {
    const withNumber = configCoverage(cfg({ trackingNumber: "+15555550100" }));
    expect(await withNumber.forZip("85032")).toEqual({ covered: true, trackingNumber: "+15555550100", leadTypes: ["form", "call"] });
    expect(leadTypesFor({ primaryCta: "call" }, "+15555550100")).toEqual(["call", "form"]);
    expect(leadTypesFor({ primaryCta: "call" }, null)).toEqual(["form"]);
  });

  it("none mode uses the same config rule; service_direct is a stub with no coverage", async () => {
    expect((await coverageProviderFor(cfg({ buyerMode: "none" })).forZip("85032")).covered).toBe(true);
    expect(await coverageProviderFor(cfg({ buyerMode: "service_direct" })).forZip("85032")).toEqual({ covered: false, leadTypes: [] });
  });

  it("env overrides are validated", () => {
    expect(buyerConfigFromEnv(env({ BUYER_MODE: "none" })).buyerMode).toBe("none");
    expect(buyerConfigFromEnv(env({})).buyerMode).toBe("manual");
    expect(() => buyerConfigFromEnv(env({ BUYER_MODE: "auto" }))).toThrow();
  });

  it("GET /api/coverage validates the ZIP", async () => {
    const p = coverageProviderFor(BUYER_CONFIG);
    const ok = await handleCoverageGet(new Request("https://x.test/api/coverage?zip=85032"), p);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ covered: true, leadTypes: ["form"] });
    const bad = await handleCoverageGet(new Request("https://x.test/api/coverage?zip=abc"), p);
    expect(bad.status).toBe(400);
  });
});
