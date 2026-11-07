-- An invited user can see that an invitation is theirs (needed for them to read the invite and its event).
-- The host still cannot read this table, so they never learn whether someone has an account (SPEC §5).
grant select on public.invite_recipients to authenticated;
create policy "invite_recipients: invitee can read own" on public.invite_recipients for select to authenticated
  using (user_id = (select auth.uid()));
