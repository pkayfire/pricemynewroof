-- events: append-only funnel log (docs/SPEC.md, Tracking and attribution). No PII.

create table if not exists public.events (
  id               bigint generated always as identity primary key,
  ts               timestamptz not null default now(),
  session_id       text,
  name             text not null check (name in (
                     'page_view', 'address_entered', 'measured', 'fallback_shown', 'estimate_shown',
                     'explanation_shown', 'call_click', 'form_submit', 'email_estimate',
                     'lead_forwarded', 'call_qualified')),
  -- client: POST /api/events; server: recorded by the app (lead_forwarded, call_qualified).
  source           text not null default 'client' check (source in ('client', 'server')),
  attribution_json jsonb not null default '{}'::jsonb,
  props_json       jsonb not null default '{}'::jsonb
);

create index if not exists events_session_ts_idx on public.events (session_id, ts);
create index if not exists events_name_ts_idx on public.events (name, ts);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- Append-only, even for the service role.
create or replace function public.events_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'events is append-only';
end;
$$;

drop trigger if exists events_no_update_delete on public.events;
create trigger events_no_update_delete
  before update or delete on public.events
  for each row execute function public.events_append_only();
