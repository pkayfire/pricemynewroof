import fs from "node:fs";
import path from "node:path";
import type { BuildingInsightsResponse } from "@/lib/google/solar";

const dir = path.dirname(new URL(import.meta.url).pathname);

export function solarFixture(name: string): BuildingInsightsResponse {
  return JSON.parse(fs.readFileSync(path.join(dir, "solar", `${name}.json`), "utf8"));
}

export function placesFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(dir, "places", `${name}.json`), "utf8"));
}

/** A fetch stand-in that replays recorded responses and records the requests it saw. */
export function replayFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const f = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}
