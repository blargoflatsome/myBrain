-- CODING_STANDARDS §9 Database safety: every foreign key column gets an index (Postgres doesn't add one itself).
-- Found by checking the dev database against the supabase-postgres-best-practices skill (2026-11-15). Speeds up
-- joins and cascading deletes such as Delete My Account. Tables are small, so a plain (locking) create is fine.

create index if not exists connect_links_used_by_idx on public.connect_links (used_by);
create index if not exists connection_blocks_blocked_user_idx on public.connection_blocks (blocked_user);
create index if not exists connections_friend_id_idx on public.connections (friend_id);
create index if not exists notification_log_user_id_idx on public.notification_log (user_id);
create index if not exists outbound_messages_recipient_user_id_idx on public.outbound_messages (recipient_user_id);
create index if not exists routine_runs_routine_id_idx on public.routine_runs (routine_id);
create index if not exists routine_step_logs_step_id_idx on public.routine_step_logs (step_id);
create index if not exists routine_steps_routine_id_idx on public.routine_steps (routine_id);
create index if not exists vault_items_bucket_id_idx on public.vault_items (bucket_id);
