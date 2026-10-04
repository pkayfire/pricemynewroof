// Attribution capture (docs/SPEC.md, Tracking and attribution). proxy.ts reads oppref, ad_group_id
// and UTM params on landing into a first-party cookie (30 days) and assigns a session ID cookie;
// these helpers let estimates, leads and events attach both. Edge- and Node-safe.
//
// TODO(UI merge): the spec also keeps a sessionStorage copy. The client should mirror the
// pmnr_attr cookie into sessionStorage[ATTRIBUTION_STORAGE_KEY] on first load (Milestone 3 UI).
import {
  ATTRIBUTION_COOKIE,
  ATTRIBUTION_PARAMS,
  SESSION_COOKIE,
  type Attribution,
} from "@/lib/api/contracts";
import { parseCookies } from "@/lib/http/request";
import { isOptedOut } from "@/lib/privacy/opt-out";

export const ATTRIBUTION_MAX_AGE_S = 30 * 24 * 60 * 60;
/** Session cookie lifetime: 30 minutes of inactivity, refreshed on every request (proxy.ts). */
export const SESSION_IDLE_S = 30 * 60;
const MAX_VALUE = 200;

/** The pixel's browser reference cookie; sent raw to the Conversions API (not PII per OpenAI docs). */
export const OPENAI_OBREF_COOKIE = "__obref";

const clean = (v: string) => v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, MAX_VALUE);

/** Attribution params in a landing URL, or null when there are none. */
export function attributionFromUrl(url: URL, now: Date = new Date()): Attribution | null {
  const out: Attribution = {};
  let any = false;
  for (const p of ATTRIBUTION_PARAMS) {
    const v = url.searchParams.get(p);
    if (v && clean(v)) {
      out[p] = clean(v);
      any = true;
    }
  }
  if (!any) return null;
  out.capturedAt = now.toISOString();
  out.landingPath = url.pathname.slice(0, MAX_VALUE);
  return out;
}

export const encodeAttribution = (a: Attribution) => encodeURIComponent(JSON.stringify(a));

/** Parses the cookie value (already URI-decoded by parseCookies), keeping only known string fields. */
export function decodeAttribution(value: string | undefined): Attribution {
  if (!value) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    try {
      parsed = JSON.parse(decodeURIComponent(value));
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== "object") return {};
  const src = parsed as Record<string, unknown>;
  const out: Attribution = {};
  for (const k of [...ATTRIBUTION_PARAMS, "capturedAt", "landingPath"] as const) {
    const v = src[k];
    if (typeof v === "string" && clean(v)) out[k] = clean(v);
  }
  return out;
}

const SESSION_RE = /^[A-Za-z0-9_-]{8,128}$/;
export const isSessionId = (v: unknown): v is string => typeof v === "string" && SESSION_RE.test(v);
export const newSessionId = () => crypto.randomUUID();

export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  referer: string | null;
  /** From the pmnr_sid cookie, if valid. */
  sessionId: string | null;
  attribution: Attribution;
  /** OpenAI pixel browser reference (__obref cookie), if present. */
  obref: string | null;
  /** Do-not-sell cookie or Global Privacy Control (Sec-GPC: 1). */
  optedOut: boolean;
}

export function requestContext(request: Request, ip: string | null): RequestContext {
  const cookies = parseCookies(request.headers.get("cookie"));
  const sid = cookies[SESSION_COOKIE];
  const obref = cookies[OPENAI_OBREF_COOKIE];
  return {
    ip,
    userAgent: request.headers.get("user-agent")?.slice(0, 512) ?? null,
    referer: request.headers.get("referer")?.slice(0, 2048) ?? null,
    sessionId: isSessionId(sid) ? sid : null,
    attribution: decodeAttribution(cookies[ATTRIBUTION_COOKIE]),
    obref: obref && obref.length <= 256 ? obref : null,
    optedOut: isOptedOut(request.headers, cookies),
  };
}

/** Attribution as stored on leads (adds the pixel's obref so the Conversions API can match). */
export function attributionForStorage(ctx: Pick<RequestContext, "attribution" | "obref">): Attribution & { obref?: string } {
  return ctx.obref ? { ...ctx.attribution, obref: ctx.obref } : { ...ctx.attribution };
}
