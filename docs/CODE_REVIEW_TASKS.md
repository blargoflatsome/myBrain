# Code review tasks (2026-11-11)

A review of security, speed and code cleanliness, written as tasks to hand to a coding session. Each task says what is
wrong, where, what to change, and how to prove it.

**Before starting any task:** read `CLAUDE.md` and follow it (spec first, `writing-tests` skill for every test,
`npm run test:quick` after each change, migrations go to dev then `npm run test:db`). Tasks marked **Needs the user's
OK** change behaviour: ask first, then update `docs/SPEC.md` and `docs/DECISIONS.md` in the same change.

Suggested order: S1, P1, P2, then the rest. S1 and P1 are the two that matter most.

## What is already in good shape (no work needed)

- Every table has row-level security, with SQL tests for each (`src/tests/db/`).
- All 60 or so privileged database functions set `search_path = ''`, check `auth.uid()`, and are revoked from the
  public and signed-out roles. Only the four guest-link functions are open to signed-out visitors, and they need a
  192-bit random token that is stored hashed.
- Typed HTML is cleaned with DOMPurify everywhere it is shown (all four `v-html` uses); links go through `linkTarget`.
- Strict Content Security Policy and other headers in `public/_headers`.
- No secrets in the repository; only the anon key and the public push key reach the browser.
- `npm audit --omit=dev`: 0 vulnerabilities. Lint is clean. No `any`, no TODOs.
- The dev sign-in only exists on the local dev server (`env.DEV === true`).

---

## Security

### S1. Account email and phone can be edited by their owner, but are trusted to identify people (High)

**Problem.** `profiles.email`, `profiles.phone` and `profiles.phone_verified` are ordinary columns covered by the
"owner can update" policy (`supabase/migrations/20261106000000_foundation.sql:62`). The app never writes `email`, but
anyone signed in can call the API directly and set their profile email to someone else's address. These functions then
treat that profile as that person:

- `request_connection` (`20261108020000_connections.sql:88`): a request typed for `victim@example.com` goes to the
  impostor, who accepts it under any display name and then receives event invitations and free/busy times.
- `invite_people` (`20261108020000_connections.sql:249`, matching by email or phone).
- `people_with_accounts` (`20261108040000_connect_from_people_and_guests.sql:11`).
- `guest_claim_status` and `link_invites_between` (`20261108060000_guest_links.sql:55` and `:83`).

Phone has the same problem by design: it is typed once at the welcome step and never verified, yet
`request_connection` and `invite_people` match accounts on it. SPEC §10 already says "phones never match automatically"
for guest links. Neither column is unique, and the lookups use `limit 1` with no order, so which account wins is
arbitrary.

**Change (new migration).**
1. Match on the verified sign-in email. In each function above, replace `lower(p.email) = ...` with a join to
   `auth.users u on u.id = p.user_id` and compare `lower(u.email)`. (They are `security definer`, so they can read it.)
2. Make `profiles.email` and `profiles.phone_verified` impossible for clients to change: a `before update` trigger on
   `profiles` that sets `new.email := old.email` and `new.phone_verified := old.phone_verified` unless the caller is
   the service role, or column-level grants (revoke `update` on the table from `authenticated`, grant `update` on the
   editable columns only). Check that the app's five profile updates still work (`AccountView.vue:259` and `:272`,
   `App.vue:161`, `WelcomeView.vue:65`, `EventSettings.vue:95`, `NotificationSettings.vue:180`).
3. **Needs the user's OK:** stop matching accounts by phone until phones are verified (add `and p.phone_verified` to
   the phone branch of `request_connection` and `invite_people`). Connecting by phone number would stop working until
   verification exists; email, links and codes keep working. The alternative is to accept the risk and say so in
   `docs/DECISIONS.md`.

**Tests.** New `src/tests/db/rls_identity.sql`: Bob sets his profile email to Alice's address (must not change, or
must not match); Carol's connection request to Alice's address reaches Alice, not Bob; `phone_verified` cannot be set
by its owner. Add the file to the list in `scripts/test-db.mjs` if it is not picked up automatically.

### S2. Signing out leaves all my data on the device (Medium; needs the user's OK)

**Problem.** `signOut` (`src/stores/auth.ts:34`) only ends the session. The on-device database `my-brain-<user id>`
(journal, tasks, habits such as medication) stays in the browser, readable by anyone who uses that browser profile
afterwards. Only Delete My Account clears it (`auth.ts:54`).

**Change.** On sign-out, upload what is queued, then delete the on-device database
(`Dexie.delete`), the same way `deleteAccount` does. If changes are still queued and can't upload (offline), say so and
ask before discarding them. Also remove this user's `localStorage` keys (`src/ui/storage.ts`). Trade-off to confirm
with the user: the next sign-in on that device downloads everything again.

**Tests.** Browser test in `src/tests/e2e/account/`: after Sign out, the database for that user no longer exists
(`indexedDB.databases()`).

### S3. `shared_streaks()` shows habits to every signed-in user (Low; needs the user's OK)

**Problem.** `public.shared_streaks()` (`20261106090000_shared_streaks_function.sql`) returns user id, display name,
habit titles and streaks of everyone whose visibility is "everyone", to any signed-in account. The app never calls it,
and SPEC §10 now says nobody can see another user unless both agreed to connect.

**Change.** Either drop the function, or limit it to the caller's connections
(`public.are_connected(auth.uid(), h.user_id)`). If "Everyone" is no longer a real choice, remove it from the
visibility options on the Account page (spec change).

**Tests.** Update `src/tests/db/rls_habits.sql` (or wherever `shared_streaks` is checked): a stranger gets no rows.

### S4. Rows can point at another user's rows (Low; not verified, check first)

**Problem.** Row-level security checks `user_id` on the row being written, not the rows it points to. Not verified
either way: can Alice save a `routine_steps` row whose `habit_id` is Bob's habit, an `item_tags` row with Bob's
`tag_id`, a `habit_logs` row with Bob's `habit_id`, or a `vault_items` row in Bob's bucket? It would not let her read
Bob's data, but a foreign-key error versus success reveals whether an id exists, and server jobs that join these
tables could act on mixed owners.

**Change.** First write the SQL test (new `src/tests/db/rls_cross_owner.sql`) that tries each case as a second user.
For any that succeed, add a `with check` to the insert and update policies that the parent row has the same
`user_id` (for example `exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid()))`).

### S5. Content Security Policy allows any Supabase project (Low, optional)

`public/_headers` has `connect-src ... https://*.supabase.co wss://*.supabase.co`. Narrowing it to the project's own
host would stop injected code (if any ever got in) from sending data to another Supabase project. Dev and prod use
different hosts, so the file would have to be written at build time from `VITE_SUPABASE_URL` (a small Vite plugin or a
build script), and the test server must still get the same headers. Only worth doing if it stays simple.

---

## Speed

### P1. Habit streaks get slower every day the app is used (High)

**Problem.** `streaks()` in `src/habits/rules.ts:106` walks every day since the habit started. For each day,
`dayStatus` searches the whole log list (`liveLog`, `rules.ts:80`) and `deadline` builds two new
`Intl.DateTimeFormat` objects (`offsetAt`, `rules.ts:36`). `missedDaysToRecord` and `wrongMisses` do the same.

Measured with a copy of these functions (Node 22): one pass over 8 habits with a year of history takes about
**0.3 seconds**; 12 habits with two years takes about **1.1 seconds**. The Habits page calls `streakOf(h)` two or
three times per habit on every redraw (`src/habits/HabitsView.vue:46`, `:47`, `:67`, `:68`), redraws every minute,
and also runs `brain.refreshHabit` for every habit every minute (`HabitsView.vue:114`). The Dashboard
(`src/dashboard/stats.ts:40` and `:48`), the Journal stats and the trophy check after every finished item use the
same functions. So the app freezes for longer and longer as history grows.

**Change.**
1. Index logs once: build a `Map` keyed by `habit_id|date` (live logs only) and pass that, instead of `logs.find`
   per day.
2. Stop computing a deadline for days that are plainly over: for any `date < yesterday` the deadline has passed, so
   `late` is true without any time-zone maths. Only today and yesterday need `deadline()`.
3. Cache the `Intl.DateTimeFormat` objects per time zone in `offsetAt` and in `todayIn` (`src/tasks/days.ts:10`),
   which is called all over the app.
4. In `HabitsView.vue`, work out each habit's status and streaks once per change in a `computed` map, and read from it
   in the template.
5. In `HabitsView.vue:114`, the every-minute `refreshHabit` loop only needs to run when the day or the logs change,
   or when a timer deadline passes; at least skip habits whose state can't have changed.

**Tests.** The existing `src/tests/unit/habits/*.test.ts` must pass unchanged (same results). Add one unit test that
proves the rule that matters: a habit with two years of logs gives the same streaks as before. Don't add a timing
test (flaky); note the before and after timings in the pull request instead.

### P2. Every sync rewrites the newest row of every table, which redraws every screen (High, small change)

**Problem.** `pullSince` asks for rows with `updated_at >= since` (`src/sync/supabaseRemote.ts:37`), so each pull of
each table returns at least the row it already has. `pullTable` then writes it again, because it only skips rows that
are strictly older (`src/sync/engine.ts:195`). Dexie tells every live query on that table that something changed, so
coming back to the app (27 tables pulled) re-runs every query on screen, including the Dashboard's 13-table
recalculation, when nothing changed.

**Change.** In `pullTable`, skip the write when the device's copy has the same `updated_at` (`<=` instead of `<`,
still only when nothing is queued for that row). Keep `gte` in the query (it protects against two rows sharing a
timestamp).

Also in `pullSince`: pages are fetched by offset, ordered by `updated_at` only. Rows with the same `updated_at` at a
page boundary can be skipped or repeated. Add `.order('id')` as a second sort key.

**Tests.** `src/tests/unit/sync/engine.test.ts`: a second pull that returns the same row does not write it (spy on
the table's `put`, or count Dexie change events).

### P3. Stats load whole tables one after another, and twice (Medium)

**Problem.**
- `dayData()` (`src/stores/brain.ts:377`) awaits 11 full tables one at a time; `trophyHistory()` (`brain.ts:526`)
  awaits 15; `catchUp()` (`src/stores/celebrate.ts:249`) awaits 8.
- The Dashboard query (`src/dashboard/DashboardView.vue:299`) loads 13 tables in parallel and then calls
  `brain.journalStats(...)`, which loads 11 of them again through `dayData()`. It re-runs every minute and on any
  change to any of those tables.
- `checkTrophies` runs 0.8 s after every finished item and reads all 15 tables.

**Change.** Load in parallel with `Promise.all`. Let `dayStats` take the tables the caller already has (the
Dashboard passes its own) instead of loading them again. For a single day's stats, read logs by their `date` index
(`habit_logs`, `routine_runs`, `priority_task_logs`, `quest_logs` all have one in `src/sync/db.ts`) rather than the
whole table. P1 makes each of these cheaper too, so do P1 first and measure before going further.

### P4. Queued changes upload one row per request (Medium)

**Problem.** `doFlush` (`src/sync/engine.ts:116`) sends each queued row in its own request and waits for it. After
time offline, or after an action that saves many rows (a routine with steps, merging tags, Delete-and-Undo), 50 changes
are 50 round trips in a row.

**Change.** Take the run of queued entries at the front of the queue that are for the same table (skipping superseded
ones as today), and send them in one `upsert([...])`. On success delete those entries and store the returned rows
(same "still queued" rule per row). If the batch is refused, fall back to one at a time so a single bad row is the
only one marked with an error. `Remote.upsert` gains a many-rows form.

**Tests.** `engine.test.ts`: ten queued saves to one table make one upload; a refused row in a batch leaves the
others uploaded and only that row marked.

### P5. Deleted rows are kept on the device forever (Low now, grows)

**Problem.** Deletes are soft, and nothing ever removes them from the device. Every screen loads whole tables and
filters with `live()`. Alerts are the worst case: they are soft-deleted after 7 days and removed from the server 7
days later (`20261108080000_in_app_alerts.sql:21`), but stay on the device for good. Habit-log undo, cleared Vault
items and removed tag links add more.

**Change.** Once per app start, after a successful sync, delete from the device rows whose `deleted_at` is more than
30 days old and which have nothing queued in the outbox. (Undo only lasts 8 seconds, so nothing needs them.) Do it in
`SyncEngine` so it shares the outbox check.

**Tests.** `engine.test.ts`: an old deleted row is removed; a recent one and one with a queued change are kept.

### P6. The profile is fetched from the network several times at start (Low)

**Problem.** At sign-in `App.vue` updates the time zone and reads the profile (`App.vue:161`, `:165`), `AppHeader.vue:57`
reads it again for the picture, and Calendar, Account, Notification and Event settings each read it again. None of it
is kept on the device, so offline there is no picture and no name.

**Change.** One small Pinia store (`src/stores/profile.ts`) that reads the profile once per session, keeps the last
copy in `localStorage` through `src/ui/storage.ts`, and offers `update(fields)`. The screens above use it.

### P7. The Tasks page loads every task ever made (Low)

`src/tasks/TasksView.vue:118` reads the whole `tasks` table and filters in memory; done and cleared tasks are never
removed, so it only grows. `tasks` already has `due_date` and `status` indexes (`src/sync/db.ts:53`). Read open tasks
plus the chosen day's tasks through those indexes. Do this only after P1 and P2, and only if the page is measurably
slow with a few thousand tasks.

---

## Clean code

### C1. `src/stores/brain.ts` is 794 lines and holds every feature

Split the actions into feature files that take the engine and database (for example `src/habits/actions.ts`,
`src/journal/actions.ts`, `src/tags/actions.ts`, `src/trophies/actions.ts`, `src/vault/actions.ts`), and keep
`brain.ts` as the place that starts and stops syncing and hands out those actions, so screens still import one store.
The 58-name `return { ... }` list at the end is in no order; group it by feature. No behaviour change; existing tests
must pass untouched.

### C2. Small repeats in the same file

- The priority-task log id is built by hand (`brain.ts:714`) with the same recipe as `logIdFor`
  (`src/habits/rules.ts:151`). Move `logIdFor` to a shared place (for example `src/sync/ids.ts`) and use it for both,
  and for the fixed alert id in `src/stores/celebrate.ts:166`.
- `snoozePriority` and `cancelPriority` (`brain.ts:723`, `:729`) differ by one function name. One helper.
- The `existing journal entry for a date` lookup is written twice (`brain.ts:446`, `:473`).

### C3. Four screens each run their own minute clock

`DashboardView.vue:296`, `HabitsView.vue:110`, `JournalView.vue:136` and `PriorityReminder.vue:46` each create a
`now` ref and a `setInterval`. Add `src/composables/useNow.ts` (`useNow(everyMs)`, cleared on dispose, refreshed when
the page becomes visible again) next to `useToday`, and use it in all four.

### C4. Hand-built windows and controls where shared ones exist

- `src/reminders/components/PriorityTasks.vue:21` builds its own editor window, Save/Close row, Delete link and
  weekday chips. Use `EditorDialog.vue` and `WeekdayPicker.vue` like every other editor.
- `src/account/AccountView.vue:125` and `:170` are two near-identical "type DELETE to confirm" windows. Extract one
  `TypeToConfirmDialog.vue` in `src/components/` (heading, body slot, word to type, confirm label, colour).
- 55 buttons write out `rounded-xl border border-line px-…` by hand and 12 write out the accent button, instead of
  `secondaryButton`, `rowAction`, `primaryButton` from `src/ui/styles.ts`. Replace them (this overlaps the UI review's
  consistency list, so do them together). Add a `tabButton(on)` to `styles.ts` for the Tasks tabs and the Calendar view
  switch, which are also hand-written.

### C5. Leftovers

- Unused wording in `src/messages.ts` `nav`: `dashboard`, `menu`, `account` (no uses). Check `closeMore` (one use).
- Comments that point at the wrong spec section: "SPEC §9" for Delete My Account in `AccountView.vue:279`,
  `src/stores/auth.ts:40` and `src/tests/db/rls_account.sql:1` (§9 is the dropped Pi display; the rule is in §5
  Account page and §8).
- Comments that mention build steps ("step 7 notification", "Step 5:", seven places): say what the thing is instead.
- `docs/SPEC.md` §5 Account page contradicts itself. It says streaks are shown on the Dashboard, not the Account page,
  and also "The page shows each habit's current streak"; it also still says "Settings on the Account page are grouped
  into two cards". Ask the user which lines stand, then remove the others.
- `supabaseRemote.ts:27` and three other places use `as never` to get past the table types. A small typed helper in
  `src/sync/types.ts` would remove them; low value, do it only while already in those files.
