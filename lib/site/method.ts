// Facts for the "How we estimate" page, from the pinned config (Milestone 2's loader), read at
// build time so the page always matches what the engine uses.
import { loadConfig } from "@/lib/config/load";
import type { BuiltConfig } from "@/config/lib/schema";

export type MethodFacts = BuiltConfig;

export function loadMethodFacts(): MethodFacts {
  return loadConfig();
}
