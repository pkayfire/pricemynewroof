-- estimates: one row per POST /api/estimate (docs/SPEC.md, API contracts and data model).
-- Google-derived data (measurements_json, formatted_address) must be purged at expires_at
-- (Google Maps Platform 30-day caching limit); place_id may be kept.

create table if not exists public.estimates (
  id                uuid primary key,
  created_at        timestamptz not null default now(),
  -- When the Google-derived columns must be nulled. created_at + 30 days, or the original
  -- measurement's expiry when a stored measurement is reused.
  expires_at        timestamptz not null,
  place_id          text not null,
  zip               text not null check (zip ~ '^[0-9]{5}$'),
  cbsa              text check (cbsa ~ '^[0-9]{5}$'),
  state             text not null check (state ~ '^[A-Z]{2}$'),
  formatted_address text,
  measurements_json jsonb,
  -- Whether measurements_json holds a reusable Solar result: ok, no_building, or null.
  solar_status      text check (solar_status in ('ok', 'no_building')),
  needs_fallback    boolean not null,
  fallback_reason   text check (fallback_reason in ('no_building', 'solar_error', 'out_of_range')),
  current_roof      text,
  options_json      jsonb,
  drivers_json      jsonb,
  config_version    integer not null,
  session_id        text,
  client            text not null default 'web' check (client in ('web', 'chatgpt', 'claude', 'api')),
  purged_at         timestamptz,
  check (expires_at <= created_at + interval '30 days')
);

-- Reuse lookup: newest unexpired measurement for a place.
create index if not exists estimates_place_reuse_idx
  on public.estimates (place_id, created_at desc)
  where measurements_json is not null;

-- Purge job scan.
create index if not exists estimates_expires_idx
  on public.estimates (expires_at)
  where measurements_json is not null or formatted_address is not null;

create index if not exists estimates_session_idx on public.estimates (session_id);

-- Server-only access with the service role key (which bypasses RLS). RLS on, no public policies,
-- so the anon and authenticated roles can read or write nothing.
alter table public.estimates enable row level security;
revoke all on public.estimates from anon, authenticated;

-- Nulls Google-derived data past expires_at. Called daily by /api/cron/purge-measurements
-- (later milestone). Returns the number of rows purged.
create or replace function public.purge_expired_estimates()
returns integer
language sql
security invoker
set search_path = public
as $$
  with purged as (
    update public.estimates
       set measurements_json = null,
           formatted_address = null,
           solar_status = null,
           purged_at = now()
     where expires_at <= now()
       and (measurements_json is not null or formatted_address is not null)
    returning 1
  )
  select count(*)::integer from purged;
$$;

revoke all on function public.purge_expired_estimates() from public, anon, authenticated;
