-- Supabase's security advisor flags views that run with their owner's rights (lint 0010).
-- Replace the shared_streaks view with a function that does the same, explicitly and with a fixed search_path.
-- It is still the only way anyone else can see streaks (SPEC §5 Profile page): habit title and streak numbers, never
-- private habits, and only for profiles set to "everyone". Signed-out visitors cannot call it.
drop view if exists public.shared_streaks;

create function public.shared_streaks()
returns table (user_id uuid, display_name text, title text, current_streak int, best_streak int)
language sql
stable
security definer
set search_path = ''
as $$
  select h.user_id, p.display_name, h.title, h.current_streak, h.best_streak
  from public.habits h
  join public.profiles p on p.user_id = h.user_id
  where h.deleted_at is null
    and h.is_private = false
    and p.deleted_at is null
    and p.streak_visibility = 'everyone';
$$;

revoke all on function public.shared_streaks() from public, anon;
grant execute on function public.shared_streaks() to authenticated;
