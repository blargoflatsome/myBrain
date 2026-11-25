-- The server fills each person's copy of my message (SPEC §5 Cancelling). The cancel preview on the device must read the
-- same: src/tests/unit/events/guest-messages.test.ts checks the device against these exact strings, and that each is
-- here, so change both together. Nothing is written. Run: npm run test:db
do $$
declare
  ev public.events;
  cancel constant text := 'Hi {{name}}, I''m sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!';
  got text;
begin
  ev.title := 'Party';
  ev.start_date := '2026-11-20';
  ev.start_time := '19:00';
  got := public.fill_message(cancel, 'Carol', ev);
  if got is distinct from 'Hi Carol, I''m sorry, but I have to cancel Party on Friday, November 20 at 7:00 pm. Sorry for the short notice!' then
    raise exception 'FAIL: Spec §5 Cancelling: a timed event is filled in with name, event, date and time (got %)', got;
  end if;

  ev.start_time := '00:30';
  got := public.fill_message(cancel, '   ', ev);
  if got is distinct from 'Hi there, I''m sorry, but I have to cancel Party on Friday, November 20 at 12:30 am. Sorry for the short notice!' then
    raise exception 'FAIL: Spec §5 Cancelling: a blank name reads "there", and just after midnight is 12:30 am (got %)', got;
  end if;

  ev.start_time := null;
  got := public.fill_message(cancel, null, ev);
  if got is distinct from 'Hi there, I''m sorry, but I have to cancel Party on Friday, November 20. Sorry for the short notice!' then
    raise exception 'FAIL: Spec §5 Cancelling: an all-day event drops " at {{time}}" (got %)', got;
  end if;

  ev.title := 'Picnic';
  ev.start_date := '2026-11-07';
  got := public.fill_message('{{event}}: {{date}}, {{time}}', 'Dan', ev);
  if got is distinct from 'Picnic: Saturday, November 7, all day' then
    raise exception 'FAIL: Spec §5 Cancelling: {{time}} on its own reads "all day" for an all-day event (got %)', got;
  end if;

  raise exception 'PASS: Spec §5 Cancelling: each copy of my message is filled in as the device previews it';
end $$;
