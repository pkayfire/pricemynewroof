-- Estimate page engagement (Oct 14): scroll_depth (25/50/75/100), cta_seen (the sheet's call button
-- half in view) and page_time (seconds visible, sent each time the page is hidden). Client events.

alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'page_view', 'address_entered', 'measured', 'fallback_shown', 'estimate_shown',
  'explanation_shown', 'scroll_depth', 'cta_seen', 'page_time', 'quote_click', 'call_click',
  'form_submit', 'email_estimate', 'lead_created', 'lead_forwarded', 'call_qualified'));
