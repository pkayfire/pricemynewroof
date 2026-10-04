-- email_signups: "email me this estimate" (and the opt-in "tell me when roofers are available").
create table if not exists public.email_signups (
  id                  uuid primary key,
  created_at          timestamptz not null default now(),
  estimate_id         uuid not null references public.estimates (id),
  email               text not null check (char_length(email) <= 254),
  notify_when_covered boolean not null,
  consent_ts          timestamptz not null,
  session_id          text,
  attribution_json    jsonb not null default '{}'::jsonb
);
create index if not exists email_signups_created_idx on public.email_signups (created_at desc);
create index if not exists email_signups_notify_idx on public.email_signups (notify_when_covered) where notify_when_covered;
alter table public.email_signups enable row level security;
revoke all on public.email_signups from anon, authenticated;

-- do_not_sell_requests: California "Do not sell or share my personal information" requests.
create table if not exists public.do_not_sell_requests (
  id               uuid primary key,
  created_at       timestamptz not null default now(),
  -- Email (lowercased) and/or phone (E.164 when valid, else digits) identify the records.
  email            text check (email is null or (char_length(email) <= 254 and email = lower(email))),
  phone            text check (phone is null or char_length(phone) <= 40),
  name             text,
  state            text check (state is null or state ~ '^[A-Z]{2}$'),
  request_type     text not null default 'opt_out_sale_share' check (request_type in ('opt_out_sale_share', 'limit_sensitive')),
  authorized_agent boolean not null default false,
  details          text check (details is null or char_length(details) <= 2000),
  -- SHA-256 of the requester's IP (never the raw IP).
  ip_hash          text check (ip_hash ~ '^[0-9a-f]{64}$'),
  session_id       text,
  check (email is not null or phone is not null)
);
create index if not exists do_not_sell_email_idx on public.do_not_sell_requests (email);
create index if not exists do_not_sell_phone_idx on public.do_not_sell_requests (phone);
create index if not exists do_not_sell_session_idx on public.do_not_sell_requests (session_id);
alter table public.do_not_sell_requests enable row level security;
revoke all on public.do_not_sell_requests from anon, authenticated;

-- config_versions: one row per published estimate config (config/dist/config-vN.json).
create table if not exists public.config_versions (
  version   integer primary key check (version >= 1),
  built_at  timestamptz not null,
  checksum  text not null check (checksum ~ '^[0-9a-f]{64}$')
);
alter table public.config_versions enable row level security;
revoke all on public.config_versions from anon, authenticated;
