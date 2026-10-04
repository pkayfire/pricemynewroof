import { describe, expect, it } from "vitest";
import { noCoverage } from "@/lib/coverage";
import { handleEstimatePost } from "@/lib/estimates/http";
import { handleEstimate, type EstimateDeps } from "@/lib/estimates/service";
import { MemoryEstimateStore } from "@/lib/estimates/store";
import { fromRow, toRow } from "@/lib/estimates/supabase-store";
import type { EstimateResponse } from "@/lib/estimates/types";
import { GoogleApiError } from "@/lib/google/http";
import { parsePlaceDetails, PlaceError } from "@/lib/google/places";
import { parseBuildingInsights, type SolarResult } from "@/lib/google/solar";
import { placesFixture, solarFixture } from "@/test/fixtures";
import { testConfig } from "@/test/fixtures/config";

const T0 = new Date("2026-10-03T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function setup(solar: string | SolarResult = "simple", place = "details-address") {
  const store = new MemoryEstimateStore();
  const calls = { places: 0, solar: 0 };
  let clock = T0;
  let n = 0;
  const deps: EstimateDeps = {
    store,
    coverage: noCoverage,
    config: testConfig(),
    getPlace: async (id) => {
      calls.places++;
      return parsePlaceDetails(placesFixture(place), id);
    },
    findBuilding: async () => {
      calls.solar++;
      if (typeof solar !== "string") return solar;
      return { status: "ok", measurements: parseBuildingInsights(solarFixture(solar)) };
    },
    now: () => clock,
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    siteUrl: "https://example.test/",
  };
  return { deps, store, calls, setNow: (d: Date) => (clock = d) };
}

async function ok(raw: unknown, deps: EstimateDeps): Promise<EstimateResponse> {
  const r = await handleEstimate(raw, deps);
  if (r.status !== 200) throw new Error(`expected 200, got ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}

describe("POST /api/estimate service", () => {
  it("returns the contract fields and stores the estimate", async () => {
    const { deps, store, calls } = setup();
    const r = await ok({ placeId: "SYNTHETIC_PLACE_ID_1" }, deps);
    expect(r).toMatchObject({
      estimateId: "00000000-0000-4000-8000-000000000001",
      needsFallback: false,
      fallbackReason: null,
      configVersion: 7,
      coverage: { covered: false, leadTypes: [] },
      client: "web",
      locationText: "For the Sample Metro area.",
      address: { zip: "85032", state: "AZ" },
      methodUrl: "https://example.test/how-we-estimate",
      detailsUrl: "https://example.test/estimate/00000000-0000-4000-8000-000000000001",
    });
    expect(r.options.map((o) => o.id)).toEqual(["lift_and_relay", "concrete_tile", "architectural_shingle"]);
    for (const o of r.options) {
      expect(Object.keys(o).sort()).toEqual(["high", "id", "low", "name", "note"]);
      expect(Number.isInteger(o.low) && Number.isInteger(o.high)).toBe(true);
    }
    expect(Object.keys(r.measurements!.segments[0]).sort()).toEqual(
      ["areaSqft", "azimuth", "center", "compass", "letter", "pitch", "pitchDegrees"].sort(),
    );
    expect(r.drivers?.confidence).toBe("low");
    expect(calls).toEqual({ places: 1, solar: 1 });

    const rec = await store.get(r.estimateId);
    expect(rec).toMatchObject({
      placeId: "SYNTHETIC_PLACE_ID_1",
      zip: "85032",
      cbsa: "11111",
      state: "AZ",
      formattedAddress: "100 Example Way, Testville, AZ 85032, USA",
      configVersion: 7,
      client: "web",
      sessionId: null,
      createdAt: T0.toISOString(),
      expiresAt: new Date(T0.getTime() + 30 * DAY).toISOString(),
    });
    expect(rec?.measurements?.solar?.source).toBe("solar");
    expect(rec?.options).toEqual(r.options);
    expect(rec?.drivers).toEqual(r.drivers);
  });

  it("records the client and session", async () => {
    const { deps, store } = setup();
    const r = await ok({ placeId: "P", client: "chatgpt", sessionId: "s-1" }, deps);
    expect(r.client).toBe("chatgpt");
    expect(await store.get(r.estimateId)).toMatchObject({ client: "chatgpt", sessionId: "s-1" });
  });

  it("re-estimates with a new current roof from stored measurements, with no Google calls", async () => {
    const { deps, store, calls, setNow } = setup();
    const first = await ok({ placeId: "P" }, deps);
    setNow(new Date(T0.getTime() + 5 * DAY));
    const second = await ok({ placeId: "P", currentRoof: "shingle" }, deps);
    expect(calls).toEqual({ places: 1, solar: 1 });
    expect(second.estimateId).not.toBe(first.estimateId);
    expect(second.currentRoof).toBe("shingle");
    expect(second.measurements).toEqual(first.measurements);
    // Reused data keeps the original 30-day expiry.
    expect((await store.get(second.estimateId))?.expiresAt).toBe((await store.get(first.estimateId))?.expiresAt);
  });

  it("measures again after the 30-day limit", async () => {
    const { deps, calls, setNow } = setup();
    await ok({ placeId: "P" }, deps);
    setNow(new Date(T0.getTime() + 30 * DAY));
    await ok({ placeId: "P" }, deps);
    expect(calls).toEqual({ places: 2, solar: 2 });
  });

  it("asks for home size when Solar has no building, then prices the answers without calling Solar", async () => {
    const { deps, calls } = setup({ status: "not_found" });
    const r = await ok({ placeId: "P" }, deps);
    expect(r).toMatchObject({ needsFallback: true, fallbackReason: "no_building", measurements: null, options: [], drivers: null });
    expect(r.address.zip).toBe("85032");
    const f = await ok({ placeId: "P", fallback: { homeSqft: 2000, stories: 1, shape: "average" } }, deps);
    expect(f.needsFallback).toBe(false);
    expect(f.drivers).toMatchObject({ squares: 25.3, fallbacks: ["home_size"] });
    expect(calls).toEqual({ places: 1, solar: 1 });
  });

  it("falls back to home size on a Solar error and doesn't reuse the error", async () => {
    const { deps, calls } = setup({ status: "error", message: "x", httpStatus: 500 });
    const r = await ok({ placeId: "P" }, deps);
    expect(r).toMatchObject({ needsFallback: true, fallbackReason: "solar_error" });
    await ok({ placeId: "P" }, deps);
    expect(calls.solar).toBe(2);
  });

  it("returns the measured roof for an out-of-range size and accepts a confirmation", async () => {
    const { deps, calls } = setup("too-large");
    const r = await ok({ placeId: "P" }, deps);
    expect(r).toMatchObject({ needsFallback: true, fallbackReason: "out_of_range" });
    expect(r.measurements?.squares).toBe(69);
    const c = await ok({ placeId: "P", confirmMeasurements: true }, deps);
    expect(c.needsFallback).toBe(false);
    expect(c.drivers?.fallbacks).toContain("size_confirmed");
    expect(calls.solar).toBe(1);
  });

  it("rejects invalid requests with 400", async () => {
    const { deps, calls } = setup();
    for (const bad of [
      null,
      {},
      { placeId: "" },
      { placeId: "P", currentRoof: "thatch" },
      { placeId: "P", client: "browser" },
      { placeId: "P", fallback: { homeSqft: 2000, stories: 1 } },
      { placeId: "P", fallback: { homeSqft: 50, stories: 1, shape: "simple" } },
      { placeId: "P", extra: 1 },
    ]) {
      const r = await handleEstimate(bad, deps);
      expect(r.status).toBe(400);
    }
    expect(calls).toEqual({ places: 0, solar: 0 });
  });

  it("maps place errors to 404 / 422 and Google key errors to 502", async () => {
    const route = setup("simple", "details-route");
    expect((await handleEstimate({ placeId: "P" }, route.deps)).status).toBe(422);
    const nf = setup();
    nf.deps.getPlace = async () => {
      throw new PlaceError("not_found", "x");
    };
    expect(await handleEstimate({ placeId: "P" }, nf.deps)).toMatchObject({ status: 404, body: { error: "place_not_found" } });
    const g = setup();
    g.deps.findBuilding = async () => {
      throw new GoogleApiError("Solar API 403", 403, "PERMISSION_DENIED");
    };
    expect(await handleEstimate({ placeId: "P" }, g.deps)).toMatchObject({ status: 502, body: { error: "upstream_error" } });
  });
});

describe("HTTP handler", () => {
  it("works from a plain HTTP request with no cookies", async () => {
    const { deps } = setup();
    const res = await handleEstimatePost(
      new Request("https://example.test/api/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: "P", client: "api" }),
      }),
      () => deps,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as EstimateResponse;
    expect(body.client).toBe("api");
    expect(body.options.length).toBe(3);
  });

  it("returns 400 for a non-JSON body and 500 without leaking details", async () => {
    const { deps } = setup();
    const bad = await handleEstimatePost(new Request("https://x/api/estimate", { method: "POST", body: "nope" }), () => deps);
    expect(bad.status).toBe(400);
    const boom = await handleEstimatePost(
      new Request("https://x/api/estimate", { method: "POST", body: JSON.stringify({ placeId: "P" }) }),
      () => {
        throw new Error("GOOGLE_SERVER_API_KEY is not set");
      },
    );
    expect(boom.status).toBe(500);
    expect(await boom.json()).toEqual({ error: "internal_error", message: "The estimate could not be computed." });
  });
});

describe("Supabase row mapping", () => {
  it("round-trips a record and marks reusable Solar data", async () => {
    const { deps, store } = setup();
    const r = await ok({ placeId: "P" }, deps);
    const rec = (await store.get(r.estimateId))!;
    const row = toRow(rec);
    expect(row.solar_status).toBe("ok");
    expect(fromRow({ ...row, created_at: rec.createdAt.replace("Z", "+00:00") })).toEqual(rec);
    expect(toRow({ ...rec, measurements: null }).solar_status).toBeNull();
  });
});
