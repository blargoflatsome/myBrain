-- Energy level "needs_setup" (SPEC §5 Random Quest): Meh < Ugh < Needs setup < Medicated.
alter table public.quests drop constraint quests_energy_level;
alter table public.quests add constraint quests_energy_level
  check (energy_level in ('meh', 'ugh', 'needs_setup', 'medicated'));
