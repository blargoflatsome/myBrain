-- Energy levels (SPEC §5 Random Quest): Ugh < Fun < Needs setup < Medicated. Meh removed; new quests default to Ugh.
-- Quests that were Meh (the old lowest level) become Ugh (the new lowest).
alter table public.quests drop constraint quests_energy_level;
update public.quests set energy_level = 'ugh' where energy_level = 'meh';
alter table public.quests add constraint quests_energy_level
  check (energy_level in ('ugh', 'fun', 'needs_setup', 'medicated'));
