-- The reporting time zone: days in daily_report are America/Los_Angeles calendar days.
-- Change it here only.
create or replace function public.report_time_zone()
returns text
language sql
immutable
as $$ select 'America/Los_Angeles'::text $$;

-- daily_report: funnel by day (report_time_zone()), ad group and metro (docs/SPEC.md, Tracking and attribution →
-- Daily report). One row per (day, ad_group_id, cbsa). A session's day is its first event's day;
-- its ad group is the first non-null ad_group_id on its events; its metro is the CBSA of its first
-- estimate. Spend, CPC and cost per qualified lead are null until an ads spend source exists.

create or replace view public.daily_report
with (security_invoker = true)
as
with session_events as (
  select
    e.session_id,
    min(e.ts) as first_ts,
    (array_agg(e.attribution_json ->> 'ad_group_id' order by e.ts)
       filter (where e.attribution_json ->> 'ad_group_id' is not null))[1] as ad_group_id,
    bool_or(e.attribution_json ->> 'oppref' is not null) as from_ad,
    bool_or(e.name = 'page_view') as page_view,
    bool_or(e.name = 'address_entered') as address_entered,
    bool_or(e.name in ('measured', 'fallback_shown')) as measured,
    bool_or(e.name = 'estimate_shown') as estimate_shown,
    bool_or(e.name = 'explanation_shown') as explanation_shown,
    bool_or(e.name = 'form_submit') as form_submit,
    bool_or(e.name = 'call_click') as call_click,
    bool_or(e.name = 'email_estimate') as email_estimate,
    count(*) filter (where e.name = 'lead_forwarded') as leads_forwarded,
    count(*) filter (where e.name = 'call_qualified') as calls_qualified
  from public.events e
  where e.session_id is not null
  group by e.session_id
),
session_metro as (
  select distinct on (session_id) session_id, cbsa
  from public.estimates
  where session_id is not null
  order by session_id, created_at
),
session_leads as (
  select session_id, count(*) filter (where forward_status <> 'duplicate') as leads
  from public.leads
  where session_id is not null
  group by session_id
),
sessions as (
  select
    (s.first_ts at time zone public.report_time_zone())::date as day,
    m.cbsa,
    coalesce(l.leads, 0) as leads,
    s.*
  from session_events s
  left join session_metro m using (session_id)
  left join session_leads l using (session_id)
)
select
  day,
  ad_group_id,
  cbsa,
  null::numeric as spend,
  count(*) filter (where from_ad) as clicks,
  null::numeric as cpc,
  count(*) as sessions,
  count(*) filter (where page_view) as page_views,
  count(*) filter (where address_entered) as addresses_entered,
  count(*) filter (where measured) as measured,
  count(*) filter (where estimate_shown) as estimates_shown,
  count(*) filter (where explanation_shown) as explanations_shown,
  count(*) filter (where form_submit) as form_submits,
  count(*) filter (where call_click) as call_clicks,
  count(*) filter (where email_estimate) as email_estimates,
  round(count(*) filter (where address_entered)::numeric / nullif(count(*) filter (where page_view), 0), 3) as rate_address,
  round(count(*) filter (where estimate_shown)::numeric / nullif(count(*) filter (where address_entered), 0), 3) as rate_estimate,
  round(count(*) filter (where form_submit or call_click)::numeric / nullif(count(*) filter (where estimate_shown), 0), 3) as rate_cta,
  sum(leads)::integer as leads,
  sum(leads_forwarded)::integer as leads_forwarded,
  sum(calls_qualified)::integer as calls_qualified,
  null::numeric as cost_per_qualified_lead
from sessions
group by day, ad_group_id, cbsa;

revoke all on public.daily_report from anon, authenticated;
