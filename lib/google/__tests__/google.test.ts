// Contract tests on synthetic fixtures in the real response shapes. No live calls.
import { describe, expect, it } from "vitest";
import { GoogleApiError, requireServerKey } from "@/lib/google/http";
import { getPlaceDetails, PlaceError, PLACE_DETAILS_FIELDS } from "@/lib/google/places";
import { findClosestBuilding, imageryDateOf, imageryQualityOf, parseBuildingInsights } from "@/lib/google/solar";
import { placesFixture, replayFetch, solarFixture } from "@/test/fixtures";

const KEY = "test-key-not-real";

describe("Places API (New) place details", () => {
  it("returns lat/lng, ZIP, city, state and formatted address, sending the key in a header", async () => {
    const r = replayFetch([{ status: 200, body: placesFixture("details-address") }]);
    const p = await getPlaceDetails("SYNTHETIC_PLACE_ID_1", { apiKey: KEY, fetchImpl: r.fetch });
    expect(p).toMatchObject({
      placeId: "SYNTHETIC_PLACE_ID_1",
      formattedAddress: "100 Example Way, Testville, AZ 85032, USA",
      zip: "85032",
      city: "Testville",
      state: "AZ",
    });
    expect(typeof p.location.latitude).toBe("number");
    expect(r.calls[0].url).toBe("https://places.googleapis.com/v1/places/SYNTHETIC_PLACE_ID_1");
    expect(r.calls[0].url).not.toContain(KEY);
    const headers = r.calls[0].init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(KEY);
    expect(headers["X-Goog-FieldMask"]).toBe(PLACE_DETAILS_FIELDS);
  });

  it("rejects a street (not a single address)", async () => {
    const r = replayFetch([{ status: 200, body: placesFixture("details-route") }]);
    await expect(getPlaceDetails("SYNTHETIC_PLACE_ID_2", { apiKey: KEY, fetchImpl: r.fetch })).rejects.toMatchObject({
      code: "not_an_address",
    });
  });

  it("rejects a non-US address", async () => {
    const r = replayFetch([{ status: 200, body: placesFixture("details-non-us") }]);
    await expect(getPlaceDetails("SYNTHETIC_PLACE_ID_3", { apiKey: KEY, fetchImpl: r.fetch })).rejects.toMatchObject({
      code: "unsupported_location",
    });
  });

  it("maps 404 and invalid place IDs to not_found", async () => {
    for (const [status, name] of [
      [404, "error-not-found"],
      [400, "error-invalid-place-id"],
    ] as const) {
      const r = replayFetch([{ status, body: placesFixture(name) }]);
      const e = await getPlaceDetails("SYNTHETIC_BAD_ID", { apiKey: KEY, fetchImpl: r.fetch }).catch((x) => x);
      expect(e).toBeInstanceOf(PlaceError);
      expect(e.code).toBe("not_found");
    }
  });

  it("surfaces permission errors", async () => {
    const r = replayFetch([{ status: 403, body: placesFixture("error-permission") }]);
    const e = await getPlaceDetails("X", { apiKey: KEY, fetchImpl: r.fetch }).catch((x) => x);
    expect(e).toBeInstanceOf(GoogleApiError);
    expect(e.httpStatus).toBe(403);
    expect(e.message).not.toContain(KEY);
  });
});

describe("Solar API buildingInsights:findClosest", () => {
  const at = { latitude: 10, longitude: -30 };

  it("requests requiredQuality=LOW with the key in a header", async () => {
    const r = replayFetch([{ status: 200, body: solarFixture("simple") }]);
    const res = await findClosestBuilding(at, { apiKey: KEY, fetchImpl: r.fetch });
    expect(res.status).toBe("ok");
    const url = new URL(r.calls[0].url);
    expect(url.origin + url.pathname).toBe("https://solar.googleapis.com/v1/buildingInsights:findClosest");
    expect(url.searchParams.get("requiredQuality")).toBe("LOW");
    expect(url.searchParams.get("location.latitude")).toBe("10");
    expect(url.searchParams.get("location.longitude")).toBe("-30");
    expect(r.calls[0].url).not.toContain(KEY);
    expect((r.calls[0].init?.headers as Record<string, string>)["X-Goog-Api-Key"]).toBe(KEY);
  });

  it("parses segments, imagery quality and date", async () => {
    const r = replayFetch([{ status: 200, body: solarFixture("complex") }]);
    const res = await findClosestBuilding(at, { apiKey: KEY, fetchImpl: r.fetch });
    if (res.status !== "ok") throw new Error("expected ok");
    const m = res.measurements;
    expect(m.segments).toHaveLength(14);
    expect(m.imageryQuality).toBe("HIGH");
    expect(m.imageryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // proto3 JSON omits a zero pitch; it parses as 0.
    expect(m.segments.some((s) => s.pitchDegrees === 0)).toBe(true);
    expect(m.segments.every((s) => s.center !== null)).toBe(true);
  });

  it("returns not_found for 404 and for a building with no roof segments", async () => {
    for (const [status, name] of [
      [404, "not-found"],
      [200, "no-segments"],
    ] as const) {
      const r = replayFetch([{ status, body: solarFixture(name) }]);
      expect(await findClosestBuilding(at, { apiKey: KEY, fetchImpl: r.fetch })).toEqual({ status: "not_found" });
    }
  });

  it("returns an error result for server errors and throws on key problems", async () => {
    const r500 = replayFetch([{ status: 500, body: { error: { code: 500, message: "boom", status: "INTERNAL" } } }]);
    expect(await findClosestBuilding(at, { apiKey: KEY, fetchImpl: r500.fetch })).toMatchObject({
      status: "error",
      httpStatus: 500,
    });
    const r403 = replayFetch([{ status: 403, body: placesFixture("error-permission") }]);
    await expect(findClosestBuilding(at, { apiKey: KEY, fetchImpl: r403.fetch })).rejects.toBeInstanceOf(GoogleApiError);
  });

  it("returns an error result when the request itself fails", async () => {
    const failing = (async () => {
      throw new DOMException("timed out", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await findClosestBuilding(at, { apiKey: KEY, fetchImpl: failing })).toMatchObject({
      status: "error",
      httpStatus: null,
    });
  });

  it("normalizes imagery quality and date", () => {
    expect(["HIGH", "MEDIUM", "LOW", "BASE", undefined].map(imageryQualityOf)).toEqual([
      "HIGH",
      "MEDIUM",
      "LOW",
      "LOW",
      "LOW",
    ]);
    expect(imageryDateOf({ year: 2025, month: 4, day: 2 })).toBe("2025-04-02");
    expect(imageryDateOf({ year: 2025, month: 4 })).toBe("2025-04");
    expect(imageryDateOf(undefined)).toBeNull();
    expect(parseBuildingInsights({}).segments).toEqual([]);
  });
});

describe("server key", () => {
  it("reads GOOGLE_SERVER_API_KEY from the environment and fails clearly without it", () => {
    expect(requireServerKey({ GOOGLE_SERVER_API_KEY: "abc" } as unknown as NodeJS.ProcessEnv)).toBe("abc");
    expect(() => requireServerKey({} as unknown as NodeJS.ProcessEnv)).toThrow(/not set/);
  });
});
