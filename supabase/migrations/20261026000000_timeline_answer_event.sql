-- timeline_answer (Oct 26): "When are you planning to replace your roof?" above the estimate sheet's
-- call button. Props: estimate_id, answer (3_months, this_year, researching). Client event.

alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'page_view', 'address_entered', 'measured', 'fallback_shown', 'estimate_shown',
  'explanation_shown', 'scroll_depth', 'cta_seen', 'timeline_answer', 'link_click', 'page_time', 'quote_click', 'call_click',
  'measurements_click', 'form_submit', 'email_estimate', 'lead_created', 'lead_forwarded', 'call_qualified'));
