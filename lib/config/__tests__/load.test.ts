import { describe, expect, it } from "vitest";
import { checkConfig, ConfigError, configVersionFromEnv, loadConfig } from "@/lib/config/load";
import { testConfig } from "@/test/fixtures/config";

describe("config loader", () => {
  it("loads the pinned config-v2 (TX not a tile state) and it is production ready", () => {
    const c = loadConfig(2);
    expect(c.version).toBe(2);
    expect(c.tileStates).not.toContain("TX");
    expect(c.productionReady).toBe(true);
    expect(Object.keys(c.options).sort()).toEqual(["architectural_shingle", "concrete_tile", "lift_and_relay"]);
  });

  it("refuses a config built from sample inputs in production only", () => {
    const sample = testConfig({ productionReady: false, sampleInputs: ["oews_47-2181"] });
    expect(() => checkConfig(sample, "production")).toThrow(ConfigError);
    expect(() => checkConfig(sample, "production")).toThrow(/not production ready/);
    expect(checkConfig(sample, "development").version).toBe(7);
    expect(checkConfig(sample, "test").version).toBe(7);
  });

  it("rejects an invalid config", () => {
    expect(() => checkConfig({ version: 1 }, "development")).toThrow(/invalid config/);
  });

  it("reads CONFIG_VERSION, defaulting to 2", () => {
    expect(configVersionFromEnv(undefined)).toBe(2);
    expect(configVersionFromEnv("3")).toBe(3);
    expect(() => configVersionFromEnv("x")).toThrow(ConfigError);
    expect(() => loadConfig(999)).toThrow(/not found/);
  });
});
