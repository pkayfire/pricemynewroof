-- rate_limits: fixed-window counters (Build decisions, Leads: 500 estimates per hour per IP and
-- per session). Keys are hashes; raw IPs are never stored here.

create table if not exists public.rate_limits (
  bucket        text not null,
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (bucket, key, window_start)
);
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Atomically counts one hit in the current window and reports whether it is within the limit.
-- The window is aligned to multiples of p_window_seconds since the epoch.
create or replace function public.rate_limit_hit(
  p_bucket text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, hits integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into public.rate_limits as r (bucket, key, window_start, count)
  values (p_bucket, p_key, v_start, 1)
  on conflict (bucket, key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  -- Opportunistic cleanup of old windows (about 1 call in 100).
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return query select v_count <= p_limit, v_count, v_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;
