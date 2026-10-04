// HTTP handlers for the public POST endpoints (lead, email-estimate, events, do-not-sell),
// separate from the route files so tests can inject dependencies.
import {
  doNotSellRequestSchema,
  emailEstimateRequestSchema,
  eventRequestSchema,
  EVENT_LIMITS,
  OPT_OUT_COOKIE,
} from "@/lib/api/contracts";
import { requestContext, type RequestContext } from "@/lib/attribution";
import type { EmailSender } from "@/lib/email";
import { estimateEmail } from "@/lib/email/templates";
import type { EstimateView } from "@/lib/estimates/view";
import { clientIp, invalidRequest, json, readJson } from "@/lib/http/request";
import { OPT_OUT_MAX_AGE_S } from "@/lib/privacy/opt-out";
import { enforceLimit, LIMITS, type RateLimiter } from "@/lib/ratelimit";
import { sha256Hex } from "@/lib/server/hash";
import type { DoNotSellStore, EmailSignupStore, EventStore } from "@/lib/server/stores";
import { toE164US } from "./phone";
import { handleLead, type LeadDeps } from "./service";

const MAX_FORM_BYTES = 8192;

export interface Common {
  limiter: RateLimiter;
  now(): Date;
}

type Begin = { done: true; response: Response } | { done: false; ctx: RequestContext; body: unknown };

async function begin(request: Request, common: Common, rule: (typeof LIMITS)[keyof typeof LIMITS], maxBytes: number): Promise<Begin> {
  const ctx = requestContext(request, clientIp(request));
  const limited = await enforceLimit(common.limiter, rule, { ip: ctx.ip }, common.now);
  if (limited) return { done: true, response: limited };
  const body = await readJson(request, maxBytes);
  if (!body.ok) return { done: true, response: json({ error: body.status === 413 ? "too_large" : "invalid_request", message: body.message }, body.status) };
  return { done: false, ctx, body: body.value };
}

function failed(where: string, e: unknown) {
  console.error(`[${where}] failed:`, (e as Error).name, (e as Error).message);
  return json({ error: "internal_error", message: "Something went wrong. Please try again." }, 500);
}

// ---------- POST /api/lead ----------

export async function handleLeadPost(request: Request, deps: () => LeadDeps & Common): Promise<Response> {
  try {
    const d = deps();
    const start = await begin(request, d, LIMITS.lead, MAX_FORM_BYTES);
    if (start.done) return start.response;
    const result = await handleLead(start.body, start.ctx, d);
    return json(result.body, result.status);
  } catch (e) {
    return failed("lead", e);
  }
}

// ---------- POST /api/email-estimate ----------

export interface EmailEstimateDeps extends Common {
  getEstimate(id: string): Promise<EstimateView | null>;
  signups: EmailSignupStore;
  email: EmailSender;
  newId(): string;
  siteUrl: string;
}

export async function handleEmailEstimatePost(request: Request, deps: () => EmailEstimateDeps): Promise<Response> {
  try {
    const d = deps();
    const start = await begin(request, d, LIMITS.emailEstimate, MAX_FORM_BYTES);
    if (start.done) return start.response;
    const parsed = emailEstimateRequestSchema.safeParse(start.body);
    if (!parsed.success) return json(invalidRequest(parsed.error.issues), 400);
    const estimate = await d.getEstimate(parsed.data.estimateId);
    if (!estimate) return json({ error: "estimate_not_found", message: "Estimate not found." }, 404);
    const now = d.now().toISOString();
    const id = d.newId();
    await d.signups.insert({
      id,
      createdAt: now,
      estimateId: estimate.estimateId,
      email: parsed.data.email,
      notifyWhenCovered: parsed.data.notifyWhenCovered,
      consentTs: now,
      sessionId: start.ctx.sessionId,
      attribution: start.ctx.attribution,
    });
    try {
      await d.email.send(estimateEmail({ to: parsed.data.email, signupId: id, estimate, notifyWhenCovered: parsed.data.notifyWhenCovered, siteUrl: d.siteUrl }));
    } catch (e) {
      console.error("[email-estimate] send failed:", (e as Error).message);
    }
    return json({ ok: true }, 200);
  } catch (e) {
    return failed("email-estimate", e);
  }
}

// ---------- POST /api/events ----------

export interface EventsDeps extends Common {
  events: EventStore;
}

/** Validates and appends one funnel event; 204 on success. Size-limited to 4 KB and rate-limited per IP. */
export async function handleEventsPost(request: Request, deps: () => EventsDeps): Promise<Response> {
  try {
    const d = deps();
    const start = await begin(request, d, LIMITS.events, EVENT_LIMITS.maxBodyBytes);
    if (start.done) return start.response;
    const parsed = eventRequestSchema.safeParse(start.body);
    if (!parsed.success) return json(invalidRequest(parsed.error.issues), 400);
    await d.events.append({
      sessionId: parsed.data.sessionId,
      name: parsed.data.name,
      ts: d.now().toISOString(),
      source: "client",
      attribution: start.ctx.attribution,
      props: parsed.data.props,
    });
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (e) {
    return failed("events", e);
  }
}

// ---------- POST /api/do-not-sell ----------

export interface DoNotSellDeps extends Common {
  doNotSell: DoNotSellStore;
  newId(): string;
}

/** Records the opt-out and sets the pmnr_optout cookie so the pixel stays off in this browser. */
export async function handleDoNotSellPost(request: Request, deps: () => DoNotSellDeps): Promise<Response> {
  try {
    const d = deps();
    const start = await begin(request, d, LIMITS.doNotSell, MAX_FORM_BYTES);
    if (start.done) return start.response;
    const parsed = doNotSellRequestSchema.safeParse(start.body);
    if (!parsed.success) return json(invalidRequest(parsed.error.issues), 400);
    const ctx: RequestContext = start.ctx;
    const v = parsed.data;
    await d.doNotSell.insert({
      id: d.newId(),
      createdAt: d.now().toISOString(),
      email: v.email ? v.email.toLowerCase() : null,
      phone: v.phone ? (toE164US(v.phone) ?? v.phone.replace(/\D/g, "")) : null,
      name: v.name || null,
      state: v.state ?? null,
      requestType: v.requestType,
      authorizedAgent: v.authorizedAgent,
      details: v.details || null,
      ipHash: ctx.ip ? sha256Hex(`ip:${ctx.ip}`) : null,
      sessionId: ctx.sessionId,
    });
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, {
      "set-cookie": `${OPT_OUT_COOKIE}=1; Path=/; Max-Age=${OPT_OUT_MAX_AGE_S}; SameSite=Lax${secure}`,
    });
  } catch (e) {
    return failed("do-not-sell", e);
  }
}
