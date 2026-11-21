-- Default Vault bucket (SPEC §5 The Vault, Default bucket; 2026-11-20, user).
--
-- Each person has at most one default bucket, kept like stars: on the bucket for my own buckets, and on my
-- vault_stars row for a bucket shared with me. Because it can sit in either table, "only one" is kept by the device
-- (it clears the old default in the same save); if two devices disagree, the device lists the newest first.
-- A vault_stars row can now hold a default without a star, so the star becomes its own column; existing rows are stars.
-- The existing policies (owner reads, inserts and updates their own rows) cover the new columns.

alter table public.vault_buckets add column is_default boolean not null default false;

alter table public.vault_stars add column starred boolean not null default true;
alter table public.vault_stars add column is_default boolean not null default false;
