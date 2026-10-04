// "Why this price" explanation: cached LLM text that passes the validator, else the template.
// The LLM sees only the drivers object and never produces prices (CLAUDE.md).
import Anthropic from "@anthropic-ai/sdk";
import type { Drivers } from "@/lib/api/types";
import { driversHash } from "./canonical";
import { getDefaultCache, type ExplanationCache } from "./cache";
import { EXPLANATION_MAX_TOKENS, EXPLANATION_MODEL, SYSTEM_PROMPT, userMessage } from "./prompt";
import { templateExplanation } from "./template";
import { MAX_LATENCY_MS, validateExplanation } from "./validator";

/** The slice of the Anthropic client this service uses (lets tests pass a mock). */
export interface MessagesClient {
  messages: Pick<Anthropic["messages"], "create">;
}

export interface ExplanationResult {
  text: string;
  source: "llm" | "template";
  model: string | null;
  latencyMs: number;
  cached: boolean;
  /** Why the template was used, when it was. */
  failure: string | null;
}

export interface ExplanationDeps {
  client?: MessagesClient | null;
  cache?: ExplanationCache;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

let defaultClient: MessagesClient | null | undefined;
function getDefaultClient(): MessagesClient | null {
  if (defaultClient !== undefined) return defaultClient;
  const apiKey = process.env.LLM_API_KEY;
  defaultClient = apiKey ? new Anthropic({ apiKey }) : null;
  return defaultClient;
}

const defaultLog = (entry: Record<string, unknown>) => console.info(JSON.stringify(entry));

type LlmOutcome = { ok: true; text: string } | { ok: false; failure: string };

async function callLlm(client: MessagesClient, drivers: Drivers): Promise<LlmOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MAX_LATENCY_MS);
  try {
    const response = await client.messages.create(
      {
        model: EXPLANATION_MODEL,
        max_tokens: EXPLANATION_MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage(drivers) }],
      },
      { timeout: MAX_LATENCY_MS, maxRetries: 0, signal: controller.signal },
    );
    if (response.stop_reason !== "end_turn") return { ok: false, failure: `stop_reason: ${response.stop_reason}` };
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return { ok: true, text };
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError || err instanceof Anthropic.APIUserAbortError)
      return { ok: false, failure: "timeout" };
    if (err instanceof Anthropic.RateLimitError) return { ok: false, failure: "rate_limited" };
    if (err instanceof Anthropic.APIConnectionError) return { ok: false, failure: "connection_error" };
    if (err instanceof Anthropic.APIError) return { ok: false, failure: `api_error ${err.status ?? ""}`.trim() };
    return { ok: false, failure: `error: ${err instanceof Error ? err.name : "unknown"}` };
  } finally {
    clearTimeout(timer);
  }
}

export async function getExplanation(drivers: Drivers, deps: ExplanationDeps = {}): Promise<ExplanationResult> {
  const client = deps.client === undefined ? getDefaultClient() : deps.client;
  const cache = deps.cache ?? getDefaultCache();
  const now = deps.now ?? Date.now;
  const log = deps.log ?? defaultLog;
  const hash = driversHash(drivers);

  const finish = (r: ExplanationResult) => {
    log({
      event: "explanation",
      driversHash: hash,
      drivers,
      model: r.model,
      latencyMs: r.latencyMs,
      source: r.source,
      templateUsed: r.source === "template",
      cached: r.cached,
      failure: r.failure,
    });
    return r;
  };

  const hit = await cache.get(hash);
  if (hit && validateExplanation(hit.text, drivers).ok) {
    return finish({ text: hit.text, source: hit.source, model: hit.model, latencyMs: 0, cached: true, failure: null });
  }

  const template = (failure: string, latencyMs: number): ExplanationResult => ({
    text: templateExplanation(drivers),
    source: "template",
    model: null,
    latencyMs,
    cached: false,
    failure,
  });

  if (!client) return finish(template("no_llm_key", 0));

  const started = now();
  const outcome = await callLlm(client, drivers);
  const latencyMs = Math.round(now() - started);
  if (!outcome.ok) return finish(template(outcome.failure, latencyMs));

  const check = validateExplanation(outcome.text, drivers, latencyMs);
  if (!check.ok) return finish(template(`invalid: ${check.failures.join("; ")}`, latencyMs));

  // DECISION: only LLM text is cached, so a one-off timeout doesn't pin the template for those drivers.
  await cache.set({
    driversHash: hash,
    text: outcome.text,
    model: EXPLANATION_MODEL,
    latencyMs,
    source: "llm",
    createdAt: new Date(now()).toISOString(),
  });
  return finish({ text: outcome.text, source: "llm", model: EXPLANATION_MODEL, latencyMs, cached: false, failure: null });
}
