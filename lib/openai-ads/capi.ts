// OpenAI Conversions API client (server side). A submitted quote request is the lead_created
// conversion (also sent by the pixel with the same event ID); forwarded leads and qualified calls
// are custom events (docs/SPEC.md, Tracking and attribution and Build decisions).
//
// Shape per https://developers.openai.com/ads/conversions-api (retrieved 2026-10-03):
//   POST https://bzr.openai.com/v1/events?pid=<PIXEL-ID>, Authorization: Bearer <API-KEY>
//   { validate_only, events: [{ id, type, timestamp_ms, data: { type }, source_url, action_source,
//     oppref?, user?, opt_out?, custom_event_name? }] }
// Off unless OPENAI_PIXEL_ID and OPENAI_CAPI_TOKEN are both set. Personal data is only ever sent
// SHA-256 hashed; IP address is not sent.
import { hashEmail, hashPhone } from "./hash";

export const CAPI_ENDPOINT = "https://bzr.openai.com/v1/events";
export const CAPI_TIMEOUT_MS = 5000;

export type ConversionKind = "lead_submitted" | "lead_forwarded" | "call_qualified";

export interface ConversionEvent {
  kind: ConversionKind;
  /** Stable event ID, shared with the pixel for deduplication. */
  id: string;
  at: Date;
  /** The page the conversion started on (required for web events). */
  sourceUrl: string;
  email?: string | null;
  phone?: string | null;
  oppref?: string | null;
  obref?: string | null;
  /** Do-not-sell or Global Privacy Control: never sent. */
  optedOut: boolean;
}

export type ConversionOutcome = "sent" | "disabled" | "suppressed" | "failed";

export interface ConversionsClient {
  readonly enabled: boolean;
  send(event: ConversionEvent): Promise<ConversionOutcome>;
}

export interface CapiConfig {
  pixelId: string;
  token: string;
  /** OPENAI_CAPI_VALIDATE_ONLY=1: OpenAI validates without saving (for testing the integration). */
  validateOnly: boolean;
}

export function capiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CapiConfig | null {
  const pixelId = env.OPENAI_PIXEL_ID?.trim();
  const token = env.OPENAI_CAPI_TOKEN?.trim();
  if (!pixelId || !token) return null;
  return { pixelId, token, validateOnly: env.OPENAI_CAPI_VALIDATE_ONLY === "1" };
}

/**
 * lead_submitted is the standard `lead_created` event with data.type "customer_action" (owner
 * decision); lead_forwarded and call_qualified are `custom` events with those names.
 * DECISION: only hashed email and phone are sent as match keys (plus oppref and the pixel's
 * obref); no names, IP or user agent.
 */
export function buildCapiEvent(e: ConversionEvent) {
  const user: Record<string, unknown> = {};
  if (e.email) user.emails_sha256 = [hashEmail(e.email)];
  const phoneHash = e.phone ? hashPhone(e.phone) : null;
  if (phoneHash) user.phone_numbers_sha256 = [phoneHash];
  if (e.obref) user.obref = e.obref;
  const base = {
    id: e.id,
    timestamp_ms: e.at.getTime(),
    source_url: e.sourceUrl,
    action_source: "web",
    ...(e.oppref ? { oppref: e.oppref } : {}),
    ...(Object.keys(user).length ? { user } : {}),
  };
  return e.kind === "lead_submitted"
    ? { ...base, type: "lead_created", data: { type: "customer_action" } }
    : { ...base, type: "custom", custom_event_name: e.kind, data: { type: "custom" } };
}

export class OpenAIConversionsClient implements ConversionsClient {
  readonly enabled = true;
  constructor(
    private readonly config: CapiConfig,
    private readonly fetchImpl: typeof fetch = (...a) => fetch(...a),
  ) {}

  async send(event: ConversionEvent): Promise<ConversionOutcome> {
    if (event.optedOut) return "suppressed";
    const body = { validate_only: this.config.validateOnly, events: [buildCapiEvent(event)] };
    try {
      const res = await this.fetchImpl(`${CAPI_ENDPOINT}?pid=${encodeURIComponent(this.config.pixelId)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${this.config.token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(CAPI_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error(`[capi] ${event.kind} rejected: HTTP ${res.status}`);
        return "failed";
      }
      return "sent";
    } catch (e) {
      console.error(`[capi] ${event.kind} failed:`, (e as Error).name);
      return "failed";
    }
  }
}

export const disabledConversions: ConversionsClient = {
  enabled: false,
  async send() {
    return "disabled";
  },
};

export function conversionsFromEnv(env: NodeJS.ProcessEnv = process.env, fetchImpl?: typeof fetch): ConversionsClient {
  const cfg = capiConfigFromEnv(env);
  return cfg ? new OpenAIConversionsClient(cfg, fetchImpl) : disabledConversions;
}
