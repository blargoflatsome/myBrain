-- Journal: Important days (docs/SPEC.md §5 Journal). A day I marked Important, found with Search's Important
-- journals filter. Kept readable even when my journal is locked, like the yes/no answer (SPEC §5 Locking my journal).
-- A constant default adds the column without rewriting the table; the table's RLS already covers it.

alter table public.journal_entries
  add column important boolean not null default false;
