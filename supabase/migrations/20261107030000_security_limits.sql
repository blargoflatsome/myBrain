-- Security sweep (docs/SPEC.md §8 Security): size limits on everything people type, https-only addresses, and a
-- safer people search. Limits are generous (far above normal use) and stop storage abuse. They are added NOT VALID,
-- so they apply to every new write without failing on anything already stored.

-- Profiles (some fields are shown to other people: name and picture in search and invitations).
alter table public.profiles
  add constraint profiles_display_name_len check (display_name is null or length(display_name) <= 120) not valid,
  add constraint profiles_avatar_url_https check (avatar_url is null or (length(avatar_url) <= 2000 and avatar_url ~* '^https://')) not valid,
  add constraint profiles_bio_len check (bio is null or length(bio) <= 2000) not valid,
  add constraint profiles_email_len check (email is null or length(email) <= 320) not valid,
  add constraint profiles_phone_len check (phone is null or length(phone) <= 40) not valid,
  add constraint profiles_timezone_len check (length(timezone) <= 64) not valid,
  add constraint profiles_ntfy_topic_len check (ntfy_topic is null or length(ntfy_topic) <= 200) not valid;

alter table public.tasks
  add constraint tasks_title_len check (length(title) <= 500) not valid,
  add constraint tasks_notes_len check (notes is null or length(notes) <= 20000) not valid;
alter table public.vault_buckets
  add constraint vault_buckets_name_len check (length(name) <= 200) not valid;
alter table public.vault_items
  add constraint vault_items_title_len check (length(title) <= 500) not valid,
  add constraint vault_items_notes_len check (notes is null or length(notes) <= 20000) not valid;
alter table public.quests
  add constraint quests_title_len check (length(title) <= 500) not valid,
  add constraint quests_details_len check (details is null or length(details) <= 20000) not valid,
  add constraint quests_energy_len check (energy_level is null or length(energy_level) <= 20) not valid;
alter table public.inbox
  add constraint inbox_body_len check (length(body) <= 20000) not valid;
alter table public.habits
  add constraint habits_title_len check (length(title) <= 500) not valid;
alter table public.routines
  add constraint routines_title_len check (length(title) <= 500) not valid;
alter table public.routine_steps
  add constraint routine_steps_title_len check (length(title) <= 500) not valid;
alter table public.priority_tasks
  add constraint priority_tasks_title_len check (length(title) <= 500) not valid,
  add constraint priority_tasks_description_len check (description is null or length(description) <= 5000) not valid;
alter table public.events
  add constraint events_title_len check (length(title) <= 500) not valid,
  add constraint events_notes_len check (notes is null or length(notes) <= 20000) not valid;
alter table public.event_invites
  add constraint event_invites_host_name_len check (host_name is null or length(host_name) <= 120) not valid;

-- Journal: the writing is formatted HTML, so it needs room; "How to make tomorrow better?" became formatted too, so
-- its old 5000 limit (meant for plain text) is raised.
alter table public.journal_entries drop constraint if exists journal_entries_tomorrow_check;
alter table public.journal_entries
  add constraint journal_entries_body_len check (length(body) <= 200000) not valid,
  add constraint journal_entries_tomorrow_len check (length(tomorrow) <= 20000) not valid;

-- Push addresses must be https (the sender also only sends to real browser push services).
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https check (length(endpoint) <= 2000 and endpoint ~* '^https://') not valid,
  add constraint push_subscriptions_keys_len check (length(p256dh) <= 200 and length(auth) <= 200) not valid,
  add constraint push_subscriptions_label_len check (device_label is null or length(device_label) <= 200) not valid;

-- Finding people by name: wildcard and escape characters are ignored, so a search can't match everyone or fail.
create or replace function public.search_people(q text)
returns table (user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, p.display_name, p.avatar_url
  from public.profiles p
  where length(trim(q)) between 3 and 100 and p.findable and p.deleted_at is null and p.user_id <> auth.uid()
    and p.display_name ilike '%' || regexp_replace(trim(q), '[%_\]', '', 'g') || '%'
  order by p.display_name
  limit 10;
$$;
