-- Cancellation messages for all-day events read "on Saturday, November 7" instead of "... at all day".
create or replace function public.fill_message(template text, recipient text, e public.events)
returns text language sql stable set search_path = '' as $$
  select replace(replace(replace(replace(
    case when e.start_time is null then replace(template, ' at {{time}}', '') else template end,
    '{{name}}', coalesce(nullif(trim(recipient), ''), 'there')),
    '{{event}}', e.title),
    '{{date}}', (select w.date_text from public.event_when(e) w)),
    '{{time}}', (select w.time_text from public.event_when(e) w));
$$;
