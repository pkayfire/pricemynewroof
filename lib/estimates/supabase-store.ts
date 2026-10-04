// Supabase implementation of EstimateStore. Server only: uses the service role key, which
// bypasses row-level security. Never import this from client components.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EstimateStore } from "./store";
import type { EstimateRecord, StoredMeasurements } from "./types";

/** Row shape of public.estimates (supabase/migrations/*_estimates.sql). */
export interface EstimateRow {
  id: string;
  created_at: string;
  expires_at: string;
  place_id: string;
  zip: string;
  cbsa: string | null;
  state: string;
  formatted_address: string | null;
  measurements_json: StoredMeasurements | null;
  solar_status: "ok" | "no_building" | null;
  needs_fallback: boolean;
  fallback_reason: string | null;
  current_roof: string | null;
  options_json: EstimateRecord["options"];
  drivers_json: EstimateRecord["drivers"];
  config_version: number;
  session_id: string | null;
  client: string;
}

export function toRow(r: EstimateRecord): EstimateRow {
  const solar = r.measurements?.solar ?? null;
  return {
    id: r.id,
    created_at: r.createdAt,
    expires_at: r.expiresAt,
    place_id: r.placeId,
    zip: r.zip,
    cbsa: r.cbsa,
    state: r.state,
    formatted_address: r.formattedAddress,
    measurements_json: r.measurements,
    solar_status: solar === null ? null : solar.source === "solar" ? "ok" : "no_building",
    needs_fallback: r.needsFallback,
    fallback_reason: r.fallbackReason,
    current_roof: r.currentRoof,
    options_json: r.options,
    drivers_json: r.drivers,
    config_version: r.configVersion,
    session_id: r.sessionId,
    client: r.client,
  };
}

export function fromRow(row: EstimateRow): EstimateRecord {
  return {
    id: row.id,
    // Postgres returns "+00:00" offsets; normalize to ISO "Z" so string comparisons work.
    createdAt: new Date(row.created_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    placeId: row.place_id,
    zip: row.zip,
    cbsa: row.cbsa,
    state: row.state,
    formattedAddress: row.formatted_address,
    measurements: row.measurements_json,
    needsFallback: row.needs_fallback,
    fallbackReason: row.fallback_reason as EstimateRecord["fallbackReason"],
    currentRoof: row.current_roof as EstimateRecord["currentRoof"],
    options: row.options_json,
    drivers: row.drivers_json,
    configVersion: row.config_version,
    sessionId: row.session_id,
    client: row.client as EstimateRecord["client"],
  };
}

export class SupabaseEstimateStore implements EstimateStore {
  constructor(private readonly db: SupabaseClient) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): SupabaseEstimateStore {
    const url = env.SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
    return new SupabaseEstimateStore(
      createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
    );
  }

  async insert(record: EstimateRecord): Promise<void> {
    const { error } = await this.db.from("estimates").insert(toRow(record));
    if (error) throw new Error(`estimates insert failed: ${error.message}`);
  }

  async get(id: string): Promise<EstimateRecord | null> {
    const { data, error } = await this.db.from("estimates").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`estimates get failed: ${error.message}`);
    return data ? fromRow(data as EstimateRow) : null;
  }

  async findReusable(placeId: string, now: Date): Promise<EstimateRecord | null> {
    const { data, error } = await this.db
      .from("estimates")
      .select("*")
      .eq("place_id", placeId)
      .in("solar_status", ["ok", "no_building"])
      .not("measurements_json", "is", null)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`estimates lookup failed: ${error.message}`);
    return data ? fromRow(data as EstimateRow) : null;
  }
}
