-- Shared Vaults, step 1 (docs/SPEC.md §5 The Vault, Shared Vaults; §5 Profiles; 2026-11-18, user):
-- Show on my profile. A bucket I mark is shown read-only to my connections on my profile.

alter table public.vault_buckets add column on_profile boolean not null default false;

-- A connection's shown buckets with their items, A to Z, or nothing if we aren't connected (or either blocked the
-- other). Read once per visit; nothing is copied to their device.
create function public.connection_vault(friend uuid)
returns table (id uuid, name text, checkable boolean, items jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if friend is null or friend = me or not public.are_connected(me, friend) or public.is_blocked(me, friend) then return; end if;
  return query
  select b.id, b.name, b.checkable,
    coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'title', i.title, 'notes', i.notes, 'rating', i.rating,
                                                  'link', i.link, 'checked', i.checked)
                               order by (b.checkable and i.checked), i.created_at)
              from public.vault_items i where i.bucket_id = b.id and i.deleted_at is null), '[]'::jsonb)
  from public.vault_buckets b
  where b.user_id = friend and b.on_profile and b.deleted_at is null
  order by lower(b.name);
end;
$$;
revoke all on function public.connection_vault(uuid) from public, anon;
grant execute on function public.connection_vault(uuid) to authenticated;
