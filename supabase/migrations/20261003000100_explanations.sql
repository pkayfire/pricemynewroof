-- explanations: cached "Why this price" text keyed by SHA-256 of the canonicalized drivers object
-- (docs/SPEC.md "Explanation service" → Caching and review; data model `explanations`).
-- The text repeats Solar-derived figures (squares, sections, pitch), so rows older than 30 days are
-- ignored by the app and should be deleted by the daily purge job (Google 30-day caching limit).

create table if not exists public.explanations (
  drivers_hash text primary key check (drivers_hash ~ '^[0-9a-f]{64}$'),
  text         text not null check (char_length(text) <= 400),
  model        text,
  latency_ms   integer not null check (latency_ms >= 0),
  source       text not null check (source in ('llm', 'template')),
  created_at   timestamptz not null default now()
);

create index if not exists explanations_created_idx on public.explanations (created_at);

-- Server-only access with the service role key (which bypasses RLS). RLS on, no public policies.
alter table public.explanations enable row level security;
revoke all on public.explanations from anon, authenticated;

-- Deletes cached explanations older than 30 days. For the daily purge cron (later milestone).
create or replace function public.purge_expired_explanations()
returns integer
language sql
security invoker
set search_path = public
as $$
  with purged as (
    delete from public.explanations
     where created_at <= now() - interval '30 days'
    returning 1
  )
  select count(*)::integer from purged;
$$;

revoke all on function public.purge_expired_explanations() from public, anon, authenticated;
