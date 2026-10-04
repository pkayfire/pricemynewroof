-- leads: quote requests with their consent record (docs/SPEC.md, Coverage, leads and calls →
-- Lead intake; API contracts and data model). Server-only access with the service role key.

create table if not exists public.leads (
  id                    uuid primary key,
  created_at            timestamptz not null default now(),
  estimate_id           uuid not null references public.estimates (id),
  name                  text not null check (char_length(name) between 1 and 100),
  -- E.164, US only.
  phone                 text not null check (phone ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  email                 text not null check (char_length(email) <= 254),
  timing                text not null check (timing in ('asap', 'within_3_months', '3_to_12_months', 'just_researching')),
  -- The service address the homeowner confirmed (or edited) on the quote form.
  address               text not null check (char_length(address) between 5 and 300),
  zip                   text not null check (zip ~ '^[0-9]{5}$'),
  state                 text not null check (state ~ '^[A-Z]{2}$'),
  -- Consent record: the exact text version shown, SHA-256 of that text, when, from where.
  consent_version       text not null,
  consent_text_hash     text not null check (consent_text_hash ~ '^[0-9a-f]{64}$'),
  consent_ts            timestamptz not null,
  consent_cert_id       text,
  ip                    text,
  user_agent            text,
  page_url              text,
  -- Squares, max pitch and current roof from the estimate (attached for the buyer).
  estimate_summary_json jsonb,
  attribution_json      jsonb not null default '{}'::jsonb,
  session_id            text,
  -- The person asked not to be tracked (do-not-sell request or Global Privacy Control):
  -- no Conversions API events are sent for this lead.
  opt_out               boolean not null default false,
  -- manual_pending: waiting for Peter to forward by hand (manual mode).
  -- held: none mode (development only). duplicate: same phone within 30 days, not re-forwarded.
  -- queued / failed: service_direct mode delivery states. forwarded: delivered to a buyer.
  forward_status        text not null check (forward_status in ('manual_pending', 'held', 'duplicate', 'queued', 'failed', 'forwarded')),
  forwarded_at          timestamptz,
  buyer_ref             text,
  duplicate_of          uuid references public.leads (id),
  check ((forward_status = 'forwarded') = (forwarded_at is not null))
);

-- Dedupe: same phone within 30 days.
create index if not exists leads_phone_created_idx on public.leads (phone, created_at desc);
-- Admin listing by status.
create index if not exists leads_status_created_idx on public.leads (forward_status, created_at desc);
create index if not exists leads_created_idx on public.leads (created_at desc);
create index if not exists leads_session_idx on public.leads (session_id);
create index if not exists leads_estimate_idx on public.leads (estimate_id);

alter table public.leads enable row level security;
revoke all on public.leads from anon, authenticated;
