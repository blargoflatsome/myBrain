-- Cheers (docs/SPEC.md §5): the post limit goes from 5 to 10 in any 24 hours (user, 2026-11-17).
create or replace function public.post_cheer(p_kind text, p_body text default '')
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  at constant timestamptz := now();
  txt text := btrim(coalesce(p_body, ''));
  stuck uuid;
  new_id uuid;
  r record;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p_kind not in ('did_it', 'stuck', 'unstuck') then raise exception 'Unknown kind' using errcode = '22023'; end if;
  if p_kind = 'stuck' then txt := ''; end if;
  if length(txt) > 140 then raise exception 'Too long' using errcode = '22001'; end if;
  if p_kind = 'did_it' and txt = '' then raise exception 'Say what you did' using errcode = '22023'; end if;
  if (select count(*) from public.cheer_posts c where c.user_id = me and c.created_at > at - interval '24 hours') >= 10 then
    raise exception 'Post limit reached' using errcode = 'P0429';
  end if;
  if p_kind = 'unstuck' then
    stuck := public.cheer_open_stuck(me, at);
    if stuck is null then raise exception 'Not stuck today' using errcode = '22023'; end if;
  end if;
  insert into public.cheer_posts (user_id, kind, body) values (me, p_kind, txt) returning id into new_id;
  if stuck is not null then
    for r in select x.user_id from public.cheer_reactions x where x.post_id = stuck loop
      perform public.record_notification(r.user_id, 'cheer_unstuck', stuck, 'Someone you cheered on got unstuck!', '', '/cheers', at);
      insert into public.cheer_tally (user_id, unstuck) values (r.user_id, 1)
      on conflict (user_id) do update set unstuck = public.cheer_tally.unstuck + 1;
    end loop;
  end if;
  return new_id;
end;
$$;
revoke all on function public.post_cheer(text, text) from public, anon;
grant execute on function public.post_cheer(text, text) to authenticated;
