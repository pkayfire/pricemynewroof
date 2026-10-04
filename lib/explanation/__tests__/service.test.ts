import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalJson, driversHash } from "../canonical";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  LayeredExplanationCache,
  MemoryExplanationCache,
  SupabaseExplanationCache,
  type ExplanationCache,
} from "../cache";
import { getExplanation, type MessagesClient } from "../service";
import { templateExplanation } from "../template";
import { SPEC_DRIVERS } from "./fixtures";

const GOOD =
  "Your roof is about 20 squares across 9 sections, and about 30% of it is steep, up to 8/12. Roofing labor in the Phoenix area runs about 8% below the national average.";

function message(text: string, stop_reason: Anthropic.Message["stop_reason"] = "end_turn"): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-haiku-4-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Message;
}

function mockClient(impl: (...args: unknown[]) => Promise<unknown>) {
  const create = vi.fn(impl);
  return { client: { messages: { create } } as unknown as MessagesClient, create };
}

const quiet = { log: () => {} };

afterEach(() => {
  vi.useRealTimers();
});

describe("getExplanation", () => {
  it("returns validated LLM text and calls the model with drivers only", async () => {
    const { client, create } = mockClient(async () => message(GOOD));
    const r = await getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), ...quiet });
    expect(r).toMatchObject({ text: GOOD, source: "llm", model: "claude-haiku-4-5", cached: false, failure: null });

    const [params, options] = create.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(params.model).toBe("claude-haiku-4-5");
    expect(params.max_tokens).toBe(300);
    expect(params).not.toHaveProperty("thinking");
    expect(params.messages).toEqual([{ role: "user", content: canonicalJson(SPEC_DRIVERS) }]);
    expect(options).toMatchObject({ timeout: 1500, maxRetries: 0 });
  });

  it("falls back to the template when the text has a number not in the drivers", async () => {
    const { client } = mockClient(async () =>
      message("Your roof is about 25 squares across 9 sections. Labor runs about 8% below the national average."),
    );
    const r = await getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), ...quiet });
    expect(r.source).toBe("template");
    expect(r.text).toBe(templateExplanation(SPEC_DRIVERS));
    expect(r.failure).toContain("number not in drivers: 25");
  });

  it("falls back to the template on a banned term", async () => {
    const { client } = mockClient(async () =>
      message("Your roof is about 20 squares. We promise labor runs about 8% below the national average."),
    );
    const r = await getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), ...quiet });
    expect(r.source).toBe("template");
    expect(r.failure).toContain("banned term: promise");
  });

  it("falls back to the template when the SDK times out", async () => {
    const { client } = mockClient(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    const r = await getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), ...quiet });
    expect(r).toMatchObject({ source: "template", failure: "timeout", text: templateExplanation(SPEC_DRIVERS) });
  });

  it("aborts the request at 1.5 seconds and uses the template", async () => {
    vi.useFakeTimers();
    const { client } = mockClient(
      (_params, options) =>
        new Promise((_resolve, reject) => {
          (options as { signal: AbortSignal }).signal.addEventListener("abort", () =>
            reject(new Anthropic.APIUserAbortError()),
          );
        }),
    );
    const pending = getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), ...quiet });
    await vi.advanceTimersByTimeAsync(1500);
    const r = await pending;
    expect(r).toMatchObject({ source: "template", failure: "timeout" });
  });

  it("uses the template when a valid answer arrives too late", async () => {
    let t = 0;
    const now = () => {
      const v = t;
      t += 1600;
      return v;
    };
    const { client } = mockClient(async () => message(GOOD));
    const r = await getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), now, ...quiet });
    expect(r.source).toBe("template");
    expect(r.failure).toContain("slow: 1600 ms");
  });

  it("uses the template on API errors, truncation and a missing key", async () => {
    const apiError = mockClient(async () => {
      throw new Anthropic.InternalServerError(500, {}, "boom", new Headers());
    });
    expect(
      (await getExplanation(SPEC_DRIVERS, { client: apiError.client, cache: new MemoryExplanationCache(), ...quiet })).failure,
    ).toBe("api_error 500");

    const truncated = mockClient(async () => message(GOOD, "max_tokens"));
    expect(
      (await getExplanation(SPEC_DRIVERS, { client: truncated.client, cache: new MemoryExplanationCache(), ...quiet }))
        .failure,
    ).toBe("stop_reason: max_tokens");

    const none = await getExplanation(SPEC_DRIVERS, { client: null, cache: new MemoryExplanationCache(), ...quiet });
    expect(none).toMatchObject({ source: "template", failure: "no_llm_key" });
  });

  it("reuses cached text for identical drivers without calling the model again", async () => {
    const cache = new MemoryExplanationCache();
    const { client, create } = mockClient(async () => message(GOOD));
    await getExplanation(SPEC_DRIVERS, { client, cache, ...quiet });
    // Same drivers with keys in a different order hash the same.
    const reordered = Object.fromEntries(Object.entries(SPEC_DRIVERS).reverse()) as typeof SPEC_DRIVERS;
    const second = await getExplanation(reordered, { client, cache, ...quiet });
    expect(second).toMatchObject({ text: GOOD, source: "llm", cached: true });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not cache template text", async () => {
    const cache = new MemoryExplanationCache();
    const { client } = mockClient(async () => {
      throw new Anthropic.APIConnectionTimeoutError();
    });
    await getExplanation(SPEC_DRIVERS, { client, cache, ...quiet });
    expect(await cache.get(driversHash(SPEC_DRIVERS))).toBeNull();
  });

  it("logs drivers, model, latency and whether the template was used", async () => {
    const log = vi.fn();
    const { client } = mockClient(async () => message(GOOD));
    await getExplanation(SPEC_DRIVERS, { client, cache: new MemoryExplanationCache(), log });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "explanation",
        drivers: SPEC_DRIVERS,
        model: "claude-haiku-4-5",
        templateUsed: false,
        latencyMs: expect.any(Number),
      }),
    );
  });
});

describe("explanation cache", () => {
  const entry = (createdAt: string) => ({
    driversHash: "a".repeat(64),
    text: GOOD,
    model: "claude-haiku-4-5",
    latencyMs: 400,
    source: "llm" as const,
    createdAt,
  });

  it("falls back to memory when the durable store fails", async () => {
    const broken: ExplanationCache = {
      get: async () => {
        throw new Error("unreachable");
      },
      set: async () => {
        throw new Error("unreachable");
      },
    };
    const onError = vi.fn();
    const cache = new LayeredExplanationCache(broken, new MemoryExplanationCache(), onError);
    expect(await cache.get("x")).toBeNull();
    await cache.set(entry(new Date().toISOString()));
    expect(await cache.get("a".repeat(64))).toMatchObject({ text: GOOD });
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("ignores entries older than 30 days", async () => {
    const cache = new MemoryExplanationCache();
    await cache.set(entry(new Date(Date.now() - 31 * 86_400_000).toISOString()));
    expect(await cache.get("a".repeat(64))).toBeNull();
  });

  it("hashes canonicalized drivers", () => {
    expect(driversHash(SPEC_DRIVERS)).toMatch(/^[0-9a-f]{64}$/);
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } })).toBe('{"a":{"c":[3,{"e":5,"f":4}],"d":2},"b":1}');
  });
});

describe("SupabaseExplanationCache", () => {
  it("reads and upserts the explanations table by drivers_hash", async () => {
    const hash = "b".repeat(64);
    const row = {
      drivers_hash: hash,
      text: GOOD,
      model: "claude-haiku-4-5",
      latency_ms: 420,
      source: "llm",
      created_at: new Date().toISOString(),
    };
    const upserts: unknown[] = [];
    const query = {
      select: () => query,
      eq: (col: string, v: string) => (col === "drivers_hash" && v === hash ? query : null),
      abortSignal: () => query,
      maybeSingle: async () => ({ data: row, error: null }),
      upsert: (r: unknown, o: unknown) => {
        upserts.push([r, o]);
        return { abortSignal: async () => ({ error: null }) };
      },
    };
    const db = { from: (t: string) => (t === "explanations" ? query : null) } as unknown as SupabaseClient;
    const cache = new SupabaseExplanationCache(db);
    expect(await cache.get(hash)).toMatchObject({ driversHash: hash, text: GOOD, latencyMs: 420, source: "llm" });
    await cache.set({
      driversHash: hash,
      text: GOOD,
      model: "claude-haiku-4-5",
      latencyMs: 420,
      source: "llm",
      createdAt: row.created_at,
    });
    expect(upserts).toEqual([[row, { onConflict: "drivers_hash" }]]);
  });
});
