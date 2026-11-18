-- Cheers (docs/SPEC.md §5): an "I got unstuck!" made in the same moment as the stuck post still closes it.
create or replace function public.cheer_open_stuck(p_user uuid, at timestamptz)
returns uuid language sql stable set search_path = '' as $$
  select s.id from public.cheer_posts s
  where s.user_id = p_user and s.kind = 'stuck' and s.deleted_at is null
    and s.created_at >= public.cheer_day_start(p_user, at)
    and not exists (select 1 from public.cheer_posts u where u.user_id = p_user and u.kind = 'unstuck'
                    and u.deleted_at is null and u.created_at >= s.created_at)
  order by s.created_at desc limit 1;
$$;
revoke all on function public.cheer_open_stuck(uuid, timestamptz) from public, anon, authenticated;
