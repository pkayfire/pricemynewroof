// Loads the pinned config version (config/dist/config-vN.json). Server only.
// Deploys pin the version with CONFIG_VERSION (default 1); rolling back = repointing it.
import fs from "node:fs";
import path from "node:path";
import { builtConfigSchema, type BuiltConfig } from "@/config/lib/schema";

export const DEFAULT_CONFIG_VERSION = 1;

export class ConfigError extends Error {}

/**
 * Validates a parsed config and enforces the production rule: a config built from sample
 * inputs (productionReady: false) is refused when NODE_ENV=production.
 */
export function checkConfig(raw: unknown, nodeEnv: string | undefined): BuiltConfig {
  const parsed = builtConfigSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(`invalid config: ${parsed.error.message.slice(0, 500)}`);
  const config = parsed.data;
  if (nodeEnv === "production" && !config.productionReady) {
    throw new ConfigError(
      `config v${config.version} is not production ready (sample inputs: ${config.sampleInputs.join(", ") || "unknown"})`,
    );
  }
  return config;
}

export function configVersionFromEnv(value = process.env.CONFIG_VERSION): number {
  if (!value) return DEFAULT_CONFIG_VERSION;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ConfigError(`CONFIG_VERSION must be a positive integer`);
  return n;
}

const cache = new Map<number, BuiltConfig>();

export function loadConfig(version = configVersionFromEnv(), dir = path.join(process.cwd(), "config", "dist")): BuiltConfig {
  const hit = cache.get(version);
  if (hit) return hit;
  const file = path.join(dir, `config-v${version}.json`);
  if (!fs.existsSync(file)) throw new ConfigError(`config v${version} not found`);
  const config = checkConfig(JSON.parse(fs.readFileSync(file, "utf8")), process.env.NODE_ENV);
  if (config.version !== version) throw new ConfigError(`config-v${version}.json says version ${config.version}`);
  cache.set(version, config);
  return config;
}
