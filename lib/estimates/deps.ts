// Production wiring for the estimate service. Server only: reads secrets from the environment.
import { randomUUID } from "node:crypto";
import { loadConfig } from "@/lib/config/load";
import { requireServerKey } from "@/lib/google/http";
import { getPlaceDetails } from "@/lib/google/places";
import { findClosestBuilding } from "@/lib/google/solar";
import { buyerConfigFromEnv } from "@/lib/buyer/config";
import { coverageProviderFor } from "@/lib/coverage";
import type { EstimateDeps } from "./service";
import { MemoryEstimateStore, type EstimateStore } from "./store";
import { SupabaseEstimateStore } from "./supabase-store";

export const DEFAULT_SITE_URL = "https://pricemynewroof.com";

const g = globalThis as unknown as { __pmnrEstimateStore?: EstimateStore };

/**
 * Supabase when SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set; otherwise an in-memory store
 * (local development only).
 * DECISION: production refuses to run without Supabase, since an in-memory store on serverless
 * functions would lose estimates between requests.
 */
export function getEstimateStore(env: NodeJS.ProcessEnv = process.env): EstimateStore {
  if (g.__pmnrEstimateStore) return g.__pmnrEstimateStore;
  let store: EstimateStore;
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    store = SupabaseEstimateStore.fromEnv(env);
  } else if (env.NODE_ENV === "production") {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  } else {
    console.warn("[estimate] SUPABASE_SERVICE_ROLE_KEY not set; using an in-memory estimate store");
    store = new MemoryEstimateStore();
  }
  g.__pmnrEstimateStore = store;
  return store;
}

export function productionDeps(env: NodeJS.ProcessEnv = process.env): EstimateDeps {
  const apiKey = requireServerKey(env);
  return {
    store: getEstimateStore(env),
    coverage: coverageProviderFor(buyerConfigFromEnv(env)),
    config: loadConfig(),
    getPlace: (placeId) => getPlaceDetails(placeId, { apiKey }),
    findBuilding: (location) => findClosestBuilding(location, { apiKey }),
    now: () => new Date(),
    newId: () => randomUUID(),
    siteUrl: env.SITE_URL || DEFAULT_SITE_URL,
  };
}
