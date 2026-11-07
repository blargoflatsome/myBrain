-- Fix for 20261107030000: its search pattern was an invalid regular expression, so every search failed. Wildcard and
-- escape characters (% _ and backslash) are now simply removed with translate(), no regular expression involved.
create or replace function public.search_people(q text)
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.avatar_url
  from public.profiles p
  where length(trim(q)) between 3 and 100 and p.findable and p.deleted_at is null and p.user_id <> auth.uid()
    and length(translate(trim(q), E'%_\\', '')) >= 3
    and p.display_name ilike '%' || translate(trim(q), E'%_\\', '') || '%'
  order by p.display_name
  limit 10;
$$;
