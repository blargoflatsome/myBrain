-- Private habits are removed (docs/SPEC.md §5 Habits, 2026-11-12): no habits are shown to anyone else, so the flag
-- did nothing. Nothing in the database reads it any more (shared_streaks was dropped in identity_lock).
alter table public.habits drop column is_private;
