-- measurements_click (Oct 15): "Email me my roof measurements" under the call button, the
-- lower-commitment option for visitors who read the estimate but don't call. Client event.

alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'page_view', 'address_entered', 'measured', 'fallback_shown', 'estimate_shown',
  'explanation_shown', 'scroll_depth', 'cta_seen', 'link_click', 'page_time', 'quote_click', 'call_click',
  'measurements_click', 'form_submit', 'email_estimate', 'lead_created', 'lead_forwarded', 'call_qualified'));
