import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import oewsFixture from "./fixtures/oews_rows_sample.json";
import ppiFixture from "./fixtures/bls_ppi_response.json";
import hudFixture from "./fixtures/hud_zip_cbsa_responses.json";
import hudCountyFixture from "./fixtures/hud_zip_county_response.json";
import areaDefsFixture from "./fixtures/oews_area_definitions_rows.json";
import { downloadOews, parseOewsRows, shortAreaName } from "../fetchers/bls_oews";
import { downloadAreaDefinitions, oewsAreaDefsUrl, parseAreaDefinitionRows } from "../fetchers/oews_areas";
import { extractPpi, fetchPpi, ppiRatio, type BlsApiResponse } from "../fetchers/bls_ppi";
import {
  fetchHudCrosswalk,
  HUD_TYPE,
  NON_CBSA,
  resolveZipCbsa,
  resolveZipCounty,
  toHudCountySource,
  toHudSource,
  type HudResponse,
  type HudRow,
} from "../fetchers/hud_crosswalk";
import {
  hudCountySourceSchema,
  hudSourceSchema,
  oewsAreaDefsSourceSchema,
  oewsSourceSchema,
  ppiSourceSchema,
} from "../lib/schema";

const hudResponses = hudFixture.responses as HudResponse[];
const hudRows = hudResponses.flatMap((r) => r.data.results);
const ppiResponse = ppiFixture.response as BlsApiResponse;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("HUD crosswalk", () => {
  const resolved = resolveZipCbsa(hudRows);

  it("keeps single-CBSA ZIPs as is", () => {
    expect(resolved["92780"]).toEqual(["31080", "CA"]);
    expect(resolved["85004"]).toEqual(["38060", "AZ"]);
  });

  it("picks the highest residential ratio for multi-CBSA ZIPs", () => {
    // 59715 Bozeman: 99.6% residential in CBSA 14580, 0.4% outside any CBSA
    expect(resolved["59715"]).toEqual(["14580", "MT"]);
  });

  it("breaks residential ties on total ratio", () => {
    // 29125: res_ratio 0.5 / 0.5; tot_ratio 0.497 (99999) vs 0.503 (44940)
    expect(resolved["29125"]).toEqual(["44940", "SC"]);
    // 14173: no residential addresses at all (0 / 0); tot_ratio decides
    expect(resolved["14173"]).toEqual(["36460", "NY"]);
  });

  it("on a full tie prefers a real CBSA over 99999, then the lowest code", () => {
    const row = (geoid: string): HudRow => ({ zip: "00001", geoid, state: "ZZ", res_ratio: 0.5, tot_ratio: 0.5 });
    expect(resolveZipCbsa([row(NON_CBSA), row("20000")])["00001"][0]).toBe("20000");
    expect(resolveZipCbsa([row("30000"), row("20000")])["00001"][0]).toBe("20000");
    // order-independent
    expect(resolveZipCbsa([row("20000"), row("30000")])["00001"][0]).toBe("20000");
  });

  it("keeps non-metro ZIPs as 99999 with their state", () => {
    expect(resolved["59301"]).toEqual([NON_CBSA, "MT"]);
  });

  it("pads numeric ZIPs and CBSAs to five digits", () => {
    const out = resolveZipCbsa([{ zip: 501, geoid: 35620, state: "ny", res_ratio: 0, tot_ratio: 1 } as unknown as HudRow]);
    expect(out["00501"]).toEqual(["35620", "NY"]);
  });

  it("builds a valid source record", () => {
    const src = toHudSource(hudResponses, "2026-10-03");
    expect(hudSourceSchema.parse(src).value["59715"]).toEqual(["14580", "MT"]);
    expect(src.sourceUrl).toContain("query=All");
  });

  it("requests type=3 with query=All and a Bearer token", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(hudResponses[0]));
    await fetchHudCrosswalk({ token: "tok", fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://www.huduser.gov/hudapi/public/usps?type=3&query=All");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("fails clearly without a token or on HTTP errors", async () => {
    await expect(fetchHudCrosswalk({ token: undefined })).rejects.toThrow(/HUD_API_TOKEN is not set/);
    const fetchImpl = vi.fn(async () => new Response("no", { status: 401, statusText: "Unauthorized" }));
    await expect(
      fetchHudCrosswalk({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/HTTP 401/);
  });
});

describe("HUD ZIP → county crosswalk (type=2)", () => {
  const response = hudCountyFixture.response as HudResponse;
  const resolved = resolveZipCounty(response.data.results);

  it("keeps single-county ZIPs", () => {
    expect(resolved["59301"]).toEqual(["30017", "MT"]); // Miles City, Custer County
    expect(resolved["43793"]).toEqual(["39111", "OH"]); // Woodsfield, Monroe County
    expect(resolved["92780"]).toEqual(["06059", "CA"]);
  });

  it("picks the highest residential ratio, not the first row", () => {
    // 43006: Coshocton 0.323, Holmes 0.426, Knox 0.251
    expect(resolved["43006"]).toEqual(["39075", "OH"]);
    expect(resolved["59715"]).toEqual(["30031", "MT"]);
  });

  it("breaks residential ties on total ratio, then the lowest code", () => {
    // 14173: no residential addresses (0 / 0); tot_ratio 0.995 vs 0.005
    expect(resolved["14173"]).toEqual(["36009", "NY"]);
    const row = (geoid: string): HudRow => ({ zip: "00001", geoid, state: "ZZ", res_ratio: 0.5, tot_ratio: 0.5 });
    expect(resolveZipCounty([row("30067"), row("30031")])["00001"][0]).toBe("30031");
  });

  it("builds a valid source record and refuses a CBSA response", () => {
    const src = hudCountySourceSchema.parse(toHudCountySource([response], "2026-10-03"));
    expect(src.sourceUrl).toBe("https://www.huduser.gov/hudapi/public/usps?type=2&query=All");
    expect(src.value["43006"]).toEqual(["39075", "OH"]);
    expect(() => toHudCountySource([hudResponses[0]], "2026-10-03")).toThrow(/expected a zip-county crosswalk/);
  });

  it("requests type=2 when asked", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(response));
    await fetchHudCrosswalk({ token: "tok", type: HUD_TYPE.county, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://www.huduser.gov/hudapi/public/usps?type=2&query=All");
  });
});

describe("OEWS area definitions", () => {
  const defs = parseAreaDefinitionRows(areaDefsFixture.rows);

  it("maps counties to nonmetro areas and MSAs", () => {
    expect(defs["30017"]).toBe("nonmetro:3000006"); // Custer County MT → East-Central Montana
    expect(defs["39111"]).toBe("nonmetro:3900003"); // Monroe County OH → Eastern Ohio
    expect(defs["39075"]).toBe("nonmetro:3900002"); // Holmes County OH → North Northeastern Ohio (noncontiguous)
    expect(defs["30031"]).toBe("msa:14580"); // Gallatin County MT → Bozeman
    expect(defs["06059"]).toBe("msa:31080");
    expect(defs["09110"]).toBe("msa:25540"); // Connecticut planning region
  });

  it("validates against the source schema", () => {
    expect(() =>
      oewsAreaDefsSourceSchema.parse({
        input: "oews_area_definitions",
        sourceUrl: oewsAreaDefsUrl("25"),
        retrievedAt: "2026-10-03",
        release: "May 2025",
        value: defs,
      }),
    ).not.toThrow();
  });

  it("reads the area-code column whatever the release year in its header", () => {
    const row = { "FIPS CODE": "30", "COUNTY CODE": "17", "MAY 2026 AREA CODE": 3000006 };
    expect(parseAreaDefinitionRows([row])).toEqual({ "30017": "nonmetro:3000006" });
  });

  it("fails on a county listed under two areas or an unreadable row", () => {
    const a = { "FIPS CODE": "30", "COUNTY CODE": "017", "MAY 2025 AREA CODE": "3000006" };
    expect(() => parseAreaDefinitionRows([a, { ...a, "MAY 2025 AREA CODE": "3000003" }])).toThrow(/listed in both/);
    expect(() => parseAreaDefinitionRows([{ "FIPS CODE": "30", "COUNTY CODE": "", "MAY 2025 AREA CODE": "1" }])).toThrow(
      /unreadable row/,
    );
    expect(() => parseAreaDefinitionRows([])).toThrow(/no county rows/);
  });

  it("refuses an HTML page served in place of the xlsx", async () => {
    const fetchImpl = vi.fn(async () => new Response("<!DOCTYPE HTML><html></html>", { status: 200 }));
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "oews-defs-"));
    await expect(
      downloadAreaDefinitions({ userAgent: "test (t@example.com)", cacheDir, yy: "25", fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/did not return an xlsx/);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://www.bls.gov/oes/area_definitions_m2025.xlsx");
  });
});

describe("OEWS parser", () => {
  const areas = parseOewsRows(oewsFixture.rows);
  const byKey = new Map(areas.map((a) => [a.key, a]));

  it("reads the cross-industry, all-ownership roofers median", () => {
    expect(byKey.get("national")).toMatchObject({ kind: "national", hourlyMedian: 25, status: "ok", state: null });
    expect(byKey.get("state:AZ")).toMatchObject({ code: "04", hourlyMedian: 23, status: "ok" });
    expect(byKey.get("msa:38060")).toMatchObject({ name: "Phoenix-Mesa-Chandler", hourlyMedian: 23.5, state: "AZ" });
  });

  it("marks suppressed values as suppressed, never zero", () => {
    expect(byKey.get("msa:14580")).toMatchObject({ status: "suppressed", marker: "*", hourlyMedian: null });
    expect(byKey.get("state:MT")).toMatchObject({ status: "suppressed", marker: "#", hourlyMedian: null });
    expect(byKey.get("nonmetro:3000002")).toMatchObject({ status: "suppressed", hourlyMedian: null });
  });

  it("keeps areas with no roofers row as not_published", () => {
    expect(byKey.get("state:WY")).toMatchObject({ status: "not_published", hourlyMedian: null });
  });

  it("names areas without the state or nonmetro suffix", () => {
    expect(byKey.get("nonmetro:3000001")).toMatchObject({ kind: "nonmetro", name: "Eastern Montana", state: "MT" });
    expect(shortAreaName("msa", "Dallas-Fort Worth-Arlington, TX")).toBe("Dallas-Fort Worth-Arlington");
    expect(shortAreaName("msa", "Los Angeles-Long Beach-Anaheim, CA")).toBe("Los Angeles-Long Beach-Anaheim");
    expect(shortAreaName("msa", "New York-Newark-Jersey City, NY-NJ")).toBe("New York-Newark-Jersey City");
    expect(shortAreaName("msa", "Bozeman, MT")).toBe("Bozeman");
    expect(shortAreaName("nonmetro", "North Northeastern Ohio nonmetropolitan area (noncontiguous)")).toBe(
      "North Northeastern Ohio",
    );
  });

  it("output validates against the source schema", () => {
    expect(() =>
      oewsSourceSchema.parse({
        input: "oews_47-2181",
        sourceUrl: "https://www.bls.gov/oes/tables.htm",
        retrievedAt: "2026-10-03",
        sample: true,
        occupation: "47-2181",
        release: "SAMPLE",
        value: areas,
      }),
    ).not.toThrow();
  });

  it("refuses to download without BLS_USER_AGENT", async () => {
    const fetchImpl = vi.fn();
    await expect(
      downloadOews({
        userAgent: undefined,
        cacheDir: "/nonexistent",
        today: new Date("2026-10-03"),
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow(/BLS_USER_AGENT is not set/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("BLS PPI", () => {
  const spec = {
    family: "asphalt" as const,
    seriesId: "WPU1361",
    title: "Asphalt roofing",
    sourceUrl: "https://data.bls.gov/timeseries/WPU1361",
  };

  it("extracts the base-date and latest values", () => {
    const src = ppiSourceSchema.parse(extractPpi(ppiResponse, spec, "2026-01", "2026-10-03"));
    expect(src.base).toEqual({ period: "2026-01", value: 347.005, preliminary: false });
    expect(src.latest.period).toBe("2026-08");
    expect(src.latest).toMatchObject({ value: 374.098, preliminary: true });
    expect(src.title).toMatch(/asphalt and tar roofing/);
  });

  it("extracts the 2026-08 base month (the configured base date)", () => {
    const src = extractPpi(ppiResponse, spec, "2026-08", "2026-10-03");
    expect(src.base).toEqual({ period: "2026-08", value: 374.098, preliminary: true });
    expect(src.latest.period).toBe("2026-08");
  });

  it("returns base null when the base month is not published yet", () => {
    const src = extractPpi(ppiResponse, spec, "2026-09", "2026-10-03");
    expect(src.base).toBeNull();
  });

  it("ignores annual averages (M13) and missing values", () => {
    const response: BlsApiResponse = {
      status: "REQUEST_SUCCEEDED",
      Results: {
        series: [
          {
            seriesID: "WPU1361",
            data: [
              { year: "2026", period: "M13", value: "999" },
              { year: "2026", period: "M10", value: "-" },
              { year: "2026", period: "M09", value: "200" },
            ],
          },
        ],
      },
    };
    const src = extractPpi(response, spec, "2026-09", "2026-10-03");
    expect(src.latest).toEqual({ period: "2026-09", value: 200, preliminary: false });
    expect(src.base?.value).toBe(200);
  });

  it("computes materialRatio = ppiNow / ppiAtBaseDate", () => {
    expect(ppiRatio(374.098, 347.005)).toBe(1.0781);
    expect(ppiRatio(100, 100)).toBe(1);
    expect(() => ppiRatio(100, 0)).toThrow();
  });

  it("sends the key only in the POST body and surfaces API errors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(ppiResponse));
    await fetchPpi({
      apiKey: "k",
      seriesIds: ["WPU1361", "WPU133"],
      startYear: 2026,
      endYear: 2026,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("k=");
    expect(JSON.parse(init.body as string)).toMatchObject({ seriesid: ["WPU1361", "WPU133"], registrationkey: "k" });

    const failing = vi.fn(async () => jsonResponse({ status: "REQUEST_NOT_PROCESSED", message: ["daily limit"] }));
    await expect(
      fetchPpi({ apiKey: "k", seriesIds: [], startYear: 2026, endYear: 2026, fetchImpl: failing as unknown as typeof fetch }),
    ).rejects.toThrow(/daily limit/);
    await expect(fetchPpi({ apiKey: undefined, seriesIds: [], startYear: 2026, endYear: 2026 })).rejects.toThrow(
      /BLS_API_KEY is not set/,
    );
  });
});
