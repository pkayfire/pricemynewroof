import { createHash } from "node:crypto";
import type { Drivers } from "@/lib/api/types";

/** JSON with object keys sorted recursively, so equal drivers always serialize the same way. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** SHA-256 of the canonicalized drivers object: the explanation cache key. */
export function driversHash(drivers: Drivers): string {
  return createHash("sha256").update(canonicalJson(drivers)).digest("hex");
}
