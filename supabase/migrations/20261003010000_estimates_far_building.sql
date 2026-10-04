-- Allow the far_building fallback reason: the measured building is more than 40 m from the
-- address point (likely the wrong building); the user confirms it or answers home-size questions.
alter table public.estimates drop constraint if exists estimates_fallback_reason_check;
alter table public.estimates
  add constraint estimates_fallback_reason_check
  check (fallback_reason in ('no_building', 'solar_error', 'out_of_range', 'far_building'));
