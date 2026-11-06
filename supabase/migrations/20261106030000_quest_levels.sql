-- Step 4: Random Quest (SPEC §5 Random Quest). Energy: meh < ugh < medicated. Time buckets replace minutes.
alter table public.quests drop column estimated_minutes;
alter table public.quests add column time_bucket text
  check (time_bucket in ('30m', '2h', 'half_day', 'full_day'));
update public.quests set energy_level = null where energy_level not in ('meh', 'ugh', 'medicated');
alter table public.quests add constraint quests_energy_level check (energy_level in ('meh', 'ugh', 'medicated'));
