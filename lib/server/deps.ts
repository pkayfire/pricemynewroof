// Production wiring for the Milestone 4 services. Server only. Supabase when SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set; in-memory otherwise (local development only; production
// refuses to run without Supabase, as for the estimate store).
import { randomUUID } from "node:crypto";
import { adminEmail } from "@/lib/admin/auth";
import { buyerConfigFromEnv } from "@/lib/buyer/config";
import { coverageProviderFor } from "@/lib/coverage";
import { LogEmailSender, type EmailSender } from "@/lib/email";
import { DEFAULT_SITE_URL } from "@/lib/estimates/deps";
import { getEstimateView } from "@/lib/estimates/source";
import type { EmailEstimateDeps, DoNotSellDeps, EventsDeps, Common } from "@/lib/leads/endpoints";
import { serviceDirectForwarderStub } from "@/lib/leads/forwarder";
import type { MarkForwardedDeps } from "@/lib/leads/mark-forwarded";
import type { LeadDeps } from "@/lib/leads/service";
import { conversionsFromEnv } from "@/lib/openai-ads/capi";
import { MemoryRateLimiter, SupabaseRateLimiter, type RateLimiter } from "@/lib/ratelimit";
import { getServiceClient, hasServiceRole } from "@/lib/supabase/service";
import { MemoryDoNotSellStore, MemoryEmailSignupStore, MemoryEventStore, MemoryLeadStore } from "./memory-stores";
import type { DoNotSellStore, EmailSignupStore, EventStore, LeadStore } from "./stores";
import { SupabaseDoNotSellStore, SupabaseEmailSignupStore, SupabaseEventStore, SupabaseLeadStore } from "./supabase-stores";

type Cache = {
  limiter?: RateLimiter;
  leads?: LeadStore;
  events?: EventStore;
  signups?: EmailSignupStore;
  doNotSell?: DoNotSellStore;
  email?: EmailSender;
};
const g = globalThis as unknown as { __pmnrDeps?: Cache };
const cache = (): Cache => (g.__pmnrDeps ??= {});

export function supabaseEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (hasServiceRole(env)) return true;
  if (env.NODE_ENV === "production") throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production");
  return false;
}

export function getRateLimiter(env: NodeJS.ProcessEnv = process.env): RateLimiter {
  const c = cache();
  return (c.limiter ??= supabaseEnabled(env) ? new SupabaseRateLimiter(getServiceClient(env)) : new MemoryRateLimiter());
}

export function getLeadStore(env: NodeJS.ProcessEnv = process.env): LeadStore {
  const c = cache();
  return (c.leads ??= supabaseEnabled(env)
    ? new SupabaseLeadStore(getServiceClient(env))
    : new MemoryLeadStore());
}

export function getEventStore(env: NodeJS.ProcessEnv = process.env): EventStore {
  const c = cache();
  return (c.events ??= supabaseEnabled(env) ? new SupabaseEventStore(getServiceClient(env)) : new MemoryEventStore());
}

export function getEmailSignupStore(env: NodeJS.ProcessEnv = process.env): EmailSignupStore {
  const c = cache();
  return (c.signups ??= supabaseEnabled(env) ? new SupabaseEmailSignupStore(getServiceClient(env)) : new MemoryEmailSignupStore());
}

export function getDoNotSellStore(env: NodeJS.ProcessEnv = process.env): DoNotSellStore {
  const c = cache();
  return (c.doNotSell ??= supabaseEnabled(env) ? new SupabaseDoNotSellStore(getServiceClient(env)) : new MemoryDoNotSellStore());
}

/** STUB: log-only until the owner chooses an email provider. */
export function getEmailSender(): EmailSender {
  const c = cache();
  return (c.email ??= new LogEmailSender());
}

const siteUrl = (env: NodeJS.ProcessEnv) => env.NEXT_PUBLIC_SITE_URL || env.SITE_URL || DEFAULT_SITE_URL;
const now = () => new Date();

function common(env: NodeJS.ProcessEnv): Common {
  return { limiter: getRateLimiter(env), now };
}

export function leadDeps(env: NodeJS.ProcessEnv = process.env): LeadDeps & Common {
  const buyer = buyerConfigFromEnv(env);
  return {
    ...common(env),
    getEstimate: (id) => getEstimateView(id),
    leads: getLeadStore(env),
    doNotSell: getDoNotSellStore(env),
    coverage: coverageProviderFor(buyer),
    buyer,
    email: getEmailSender(),
    forwarder: serviceDirectForwarderStub,
    newId: randomUUID,
    siteUrl: siteUrl(env),
    adminEmail: adminEmail(env),
  };
}

export function emailEstimateDeps(env: NodeJS.ProcessEnv = process.env): EmailEstimateDeps {
  return {
    ...common(env),
    getEstimate: (id) => getEstimateView(id),
    signups: getEmailSignupStore(env),
    email: getEmailSender(),
    newId: randomUUID,
    siteUrl: siteUrl(env),
  };
}

export function eventsDeps(env: NodeJS.ProcessEnv = process.env): EventsDeps {
  return { ...common(env), events: getEventStore(env) };
}

export function doNotSellDeps(env: NodeJS.ProcessEnv = process.env): DoNotSellDeps {
  return { ...common(env), doNotSell: getDoNotSellStore(env), newId: randomUUID };
}

export function markForwardedDeps(env: NodeJS.ProcessEnv = process.env): MarkForwardedDeps {
  return {
    leads: getLeadStore(env),
    events: getEventStore(env),
    doNotSell: getDoNotSellStore(env),
    conversions: conversionsFromEnv(env),
    now,
    siteUrl: siteUrl(env),
  };
}
