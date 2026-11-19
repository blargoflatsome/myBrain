-- Shared Vaults (docs/SPEC.md §5 The Vault): live updates for shares and stars, so sharing, unsharing and starring
-- reach the member's devices straight away.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vault_shares') then
    alter publication supabase_realtime add table public.vault_shares;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vault_stars') then
    alter publication supabase_realtime add table public.vault_stars;
  end if;
end
$$;
