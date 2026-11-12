-- SPEC §5 Calendar, Contacts window (2026-11-12): a saved person who is also one of my connections shows once, as the
-- connection. Matches my own saved people to my connections by the connection's sign-in email or profile phone.
-- Phones are never verified, so this is only ever used to tidy my own list, between people already connected; it never
-- finds an account (that stays email-only, SPEC §5 Accounts and contact info).
-- The same phone typed with or without a country code (509 434 8303, +1 509-434-8303): its last 10 digits, or all of
-- them when shorter; null when there are fewer than 7.
create function public.phone_key(p text) returns text
language sql immutable set search_path = '' as $$
  select case when length(d) < 7 then null else right(d, 10) end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x;
$$;
revoke all on function public.phone_key(text) from public, anon, authenticated;

create function public.people_who_are_connections()
returns table (person_id uuid, friend_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct on (pe.id) pe.id, p.user_id
  from public.people pe
  join public.connections c on c.user_id = auth.uid() and c.deleted_at is null
  join public.profiles p on p.user_id = c.friend_id and p.deleted_at is null
  where pe.user_id = auth.uid() and pe.deleted_at is null
    and ((pe.email is not null and lower(p.email) = lower(trim(pe.email)))
      or (public.phone_key(pe.phone) is not null and public.phone_key(pe.phone) = public.phone_key(p.phone)))
  order by pe.id, c.created_at;
$$;
revoke all on function public.people_who_are_connections() from public, anon;
grant execute on function public.people_who_are_connections() to authenticated;
