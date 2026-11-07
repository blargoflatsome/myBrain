# Progress

Tracks build steps from [docs/SPEC.md §11](docs/SPEC.md#11-suggested-build-order). Update at the end of every session.

## Step 1 — Foundation (done; merging via PR #1)

Done:
- Spec saved to `docs/SPEC.md`; `CLAUDE.md` and this file created.
- Vue 3 + Vite + TypeScript + Tailwind v4 + Vue Router + Pinia scaffold (§3).
- Vitest with first passing test; Playwright (desktop Chromium + Pixel 7) with first passing tests (§3 Testing).
- ESLint + `vue-tsc` type checking.
- GitHub Actions CI: lint, typecheck, Vitest, Playwright on every PR and push to main (§3).
- `netlify.toml` (build, SPA redirect, functions dir) and `.env.example` (§13).

Account walkthrough and remaining step 1 items (§13):
- ~~Domain name question~~ — answered: none for now (SPEC §13, §14).
- ~~Netlify deploy budget~~ — decided: merge to main once per build step (SPEC §3, §14).
- ~~Netlify site~~ — created: https://myadhdbrain.netlify.app (first `main` build expected to fail until step 1 is merged).
- ~~Two Supabase projects~~ — created (dev + prod, us-east-1); CLI linked to dev; dev keys in `.env.local` and verified.
- ~~Google Cloud OAuth client~~ — done; Google enabled in both Supabase projects.
- ~~Base schema with RLS~~ — `profiles` + shared conventions migrated to dev (not yet prod).
- ~~Google sign-in in the app~~ — sign-in screen, auth guard, sign out.
- ~~Netlify env vars~~ — set per context; Google sign-in works on the Deploy Preview.
- ~~Apply migration to prod~~ — applied 2026-11-06.

## Step 2 — PWA shell, offline storage, sync queue, quick capture (done; merged via PR #2)

Done:
- Sync layer chosen: custom Dexie queue (SPEC §7, §14). Wording approved.
- Migration `20261106010000_capture.sql`: tasks, vault buckets/items, quests, inbox with RLS, Realtime, starter buckets.
- Sync engine (`src/sync`), capture logic and conversion (`src/capture`), brain store.
- PWA: manifest, icons, Capture shortcut, Web Share Target, service worker (offline app start).
- Screens: capture (with mic), inbox filing, sync indicator, persistent Capture button, calm light/dark theme.
- Tests: 39 Vitest, 32 Playwright (incl. offline capture and offline app start), SQL checks `rls_capture.sql`.

Left in step 2:
- ~~Capture migration on dev~~ — applied; `npm run test:db` passes (profiles + capture).
- ~~First milestone~~ — capture works from phone and laptop, including offline, on Deploy Preview 2 (confirmed by the user 2026-11-06).
- ~~Capture migration on prod~~ — applied 2026-11-06; merged PR #2.

## Step 3 — Tasks (done; merged via PR #3)

Done:
- Spec: priorities Low/Medium/High (green/yellow/red dot), default Low; red text only for carry-over; today follows the device timezone (§5, §14).
- Migration `20261106020000_task_priority.sql` (levels 1–3, default Low).
- Task rules (`src/tasks`): carry-over from dates, day lists, Undated, ordering, cross off, cancel.
- Tasks screen is now the home screen: Today/Undated tabs, day navigation, add, edit, delete with confirmation, Cancel/Edit after two carry-overs.
- Wording drafted in `src/messages.ts` (user asked Claude to choose).
- Tests: 57 Vitest (19 with a mocked clock: midnight, DST spring/fall, timezone travel), 58 Playwright (incl. rollover at midnight with the app open), `rls_tasks.sql`.

- Dev migrated; `npm run test:db` passes (3 files). Tested on Deploy Preview 3 in the user's Chrome against dev: add, priority edit, cross off, Undated, delete with confirmation (test task soft-deleted).
- Prod migrated (capture + priority; the step 2 capture migration had been missing on prod, see SPEC §14). Sync queue now retries refused changes on every sync.

Left in step 3:
- ~~Merge PR #3~~ — merged 2026-11-06 with the user's OK.

## Step 4 — Random Quest (done; merged via PR #4)

Done:
- Spec: energy Meh < Ugh < Medicated, time buckets, last-3 recent rule, untagged quests match any filter (§5, §14).
- Migration `20261106030000_quest_levels.sql`; `rls_quests.sql`.
- Picker (`src/quests/picker.ts`) with 15 Vitest tests; Quests screen with filters, pick/accept/re-roll/done, In progress, add/edit/delete.
- Playwright: 7 quest tests (x2 devices), stable over 3 repeats.
- Dev + prod migrated (prod confirmed up to date); `npm run test:db` passes (4 files). Tested on Deploy Preview 4 in Chrome against dev: add, set Meh/30 min, filtered pick, re-roll, delete (test quest soft-deleted).

- User-requested change: Capture is type-first with a form per type (only title required); new quests default Meh / 30 min everywhere; Quests page Add box removed (SPEC §5, §14). 80 Vitest, 80 Playwright (stable over 2 repeats).

Left in step 4:
- ~~Test type-first capture on Deploy Preview 4~~ — done in Chrome (quest captured with Meh / 30 min defaults, then deleted). ~~Merge PR #4~~ — merged 2026-11-06 with the user's OK (includes type-first capture and the Needs setup energy level).

## Between steps 4 and 5 — energy levels (branch `energy-levels`, PR #5)

- User's request: remove Meh, add Fun between Ugh and Needs setup, default Ugh (SPEC §5, §14). Meh quests migrate to Ugh.
- Dev migrated (2 Meh quests became Ugh); `npm run test:db` passes. Prod is migrated at merge time, because the live app still saves Meh until this deploys.
- User chose to ship this together with step 5 (saves a production deploy): `step-5-habits` is built on top of it.

## Step 5 — Habits, streaks, private habits, Profile page (done; merged via PR #6, includes the energy change from PR #5)

Done:
- Spec: timer starts at notify time, chosen weekdays, visibility only-me by default and editable, misses logged, shared_streaks view (§5, §14). Left text-only menu (slide-out on phones), replacing the bottom bar at the user's request.
- Migration `20261106060000_habits.sql`: habits, habit_logs (one per habit per day), RLS, Realtime, `shared_streaks` restricted view. Dev migrated; `rls_habits.sql` passes.
- Habit rules (`src/habits/rules.ts`): weekdays, deadlines across DST, streaks/best from logs, misses, undo, deterministic log ids.
- Habits page (exact tag line), habit editor, Profile page (name, bio, visibility, streaks without private habits, sign out).
- Fixed while building: reactive objects could not be saved to IndexedDB; a fresh device could invent misses before downloading history.
- Tests: 105 Vitest (habits with mocked clock), 106 Playwright, 5 SQL check files.

Left in step 5:
- ~~Chrome test on Deploy Preview 6~~ — created a habit, completed it (streak 1, fixed log id on dev), Profile showed it under the Google name, deleted it. ~~Prod migrations (energy + habits)~~ — applied right before merge. ~~Merge~~ — merged 2026-11-06 with the user's OK.

## Fix after step 5 — habit created after its timer window (done; merged via PR #7)

- Creation day is due by midnight; wrong early "missed" logs are removed automatically. Also shipped the user's own wording tweaks ("message tweaks"); tests and spec follow them.

## Step 6 — Routines and completion stats (done; merged via PR #8)

Done:
- Spec: chosen weekdays, completed = reached the last step, unstarted scheduled days count as possible, run screen URL for step 7 notifications (§5, §14).
- Migration `20261106070000_routines.sql`: routines, routine_steps, routine_runs (one per day), routine_step_logs (one per step per run), RLS, Realtime. Dev migrated; `rls_routines.sql` passes.
- Routine rules (`src/routines/rules.ts`) with 12 Vitest tests; Routines page with stats, run screen (Skip / Completed with cross-out), editor with ordered steps.
- Playwright: 9 routine tests (x2 devices), stable over 3 repeats.

Left in step 6:
- ~~Chrome test on Deploy Preview 8~~ — created a 2-step routine, ran it (Completed then Skip), saw it finish and show 1 of 1 days (100%); dev logs matched; deleted it. ~~Prod migration~~ — applied right before merge. ~~Merge~~ — merged 2026-11-06 with the user's OK.

## Step 7 — Notifications, priority habits and tasks (done, PR #9)

Done:
- Spec: Supabase Cron scheduler (user approved), priority habits, priority tasks one-off or weekdays, reminder offers slide/Snooze 10 min/Cancel (§5, §6, §14).
- Migration `20261106080000_notifications.sql`: priority flag on habits, priority_tasks + logs, reminder_state (snooze/cancel/last sent), push_subscriptions, notification_log, `due_reminders()`, `send_due_reminders()` (ntfy direct via pg_net, Web Push via Netlify function), cleanup of gone subscriptions, two cron jobs. `rls_reminders.sql` passes.
- Migration `20261106090000_shared_streaks_function.sql`: `shared_streaks` view replaced by a function (Supabase security advisor flagged the owner-rights view).
- Netlify function `send-push` (shared secret; no database access). Custom service worker with push + notification click deep links. Fixed on preview: web-push 4 is ESM with named exports only.
- App: full-screen priority reminder with slide to complete, Snooze, Cancel; Priority checkbox on habits; Tasks > Priority tab; reminder settings on Profile (device push, ntfy topic, quiet hours).
- Fixed: a background streak refresh could overwrite a habit edit (now a one-step patch).
- Netlify env vars set (VAPID keys, subject, push secret; secrets marked secret). Vault secrets `push_function_url` and `push_secret` set on dev and prod by the user (Claude may not write secret stores).
- Dev and prod migrated and verified (2 cron jobs, 2 Vault secrets on prod). Deploy Preview 9 checked in Chrome: priority task overlay, real slide drag completes it, settings render; test task soft-deleted.
- "Powered by Netlify" badge overlapped the Capture button: it is a Netlify setting (Project configuration > General), turned off by the user.

Next: user tries a real reminder on the phone (turn on device notifications on each device; optional ntfy topic).

## Step 8 — Journal (done, PR #10)

Done:
- Spec §5 Journal and §14 decision (user's answers; wording approved with two changes: "Tell me about it", "Past you let you down").
- Migration `20261106100000_journal.sql`: `journal_entries` (one per day, stats JSON, stats_final, auto), `quests.completed_at` (backfilled), `profiles.journal_reminder_time`, journal reminder in `due_reminders()`. Dev migrated; `rls_journal.sql` passes.
- App: Journal page (menu), today's stats as rings/bars/chips, writing saved as you type, tasks for tomorrow (source journal), earlier entries editable; missed days written by the app and frozen; journal reminder setting on Profile.
- Tests: `src/journal/stats.test.ts`, `e2e/journal.spec.ts`. Vitest 146, Playwright 164, SQL 8 files.

- PR #10; Deploy Preview 10 checked in Chrome (today entry created, writing saves; test text cleared). Fixed a stray dot on empty rings. Prod migrated and verified.

- Clarified (user): an entry is only written for me on a day I did something. No starting-point entry; start date kept on the device; idle days hidden.

Merged and live.

## Journal editing (branch `journal-editor`)
- User asked: bigger writing area with full screen, formatted text (bold, lists, links...), and "Add a task for tomorrow" in its own box opening the Capture screen.
- Tiptap editor (pinned 3.32.0) with toolbar: bold, italic, underline, strikethrough, heading, bullets, numbers, checklist, quote, link, full screen. Writing stored as cleaned HTML (DOMPurify); old plain-text entries open as paragraphs.
- Capture opened from the Journal: Task chosen, tomorrow's date, source journal, returns to the Journal after saving.
- Capture is now a window (modal) over the current page, from the Capture button and from the Journal's "Add a task for tomorrow" (stays ready for the next task; closing returns to the writing). The /capture page remains for the home-screen shortcut and sharing from other apps.
- Checklist items on one line; toolbar scrolls sideways with Full screen pinned.
- Toolbar buttons keep focus in the writing (phone keyboard stays open).
- Profile renamed to Account (/account; /profile redirects). Bio removed (column left unused). Settings tidied into two cards: Your profile, Reminders.
- Delete My Account: confirmation with typed DELETE; migration `20261106110000_delete_account.sql` (`delete_my_account()`, cascades everything); clears this device's copy and push subscription; `rls_account.sql` passes on dev. Dev and prod migrated. Tests: `src/journal/body.test.ts`, more in `e2e/journal.spec.ts`. Vitest 159, Playwright 184, SQL 9 files.

## Step 9 — The Vault, search and tags, calendar (done, PR #12)

Done:
- Spec §4/§5/§14 (user's choices; approved). Search runs on the device instead of Postgres full-text (approved).
- Migration `20261106120000_vault_events_tags.sql`: bucket check-off, item rating/link/checked, `events` with `event_occurs_on()`, `tags` (unique name per user ignoring case) and `item_tags`, event reminders in `due_reminders()` (now with a `detail` column) and wording. Dev migrated; `rls_vault_events_tags.sql` passes; reminder job still succeeding.
- App: The Vault page (buckets, items, check-off, Clear checked, ratings, links/maps, bucket settings, reorder, delete with items); tags on tasks, quests, vault items, journal entries, events (same tag id on every device); Search window from the menu and phone header, grouped results, tag filters, opens items where they live; Calendar page (FullCalendar 7, month/week/day) with dated tasks, priority tasks and events; event editor with repeat and reminder.
- Fixed while testing: typing quickly in the Vault's add box could lose an item.
- Tests: `src/step9.rules.test.ts`, `e2e/step9.spec.ts`. Vitest 172, Playwright 216, SQL 10 files.

- PR #12; Deploy Preview 12 checked in Chrome (vault add, check off, Clear checked; event created, found by search, opened and deleted; test data deleted). Prod migrated and verified.

- The Vault buckets now sort by drag and drop (SortableJS, drag handle; arrow keys on the handle too), replacing the up/down buttons.

- Anywhere we sort is drag and drop (user): shared `useDragSort` helper; routine steps now drag too. New spec principle "Sort by dragging".

Merged and live.

## Routines: habit steps and run anytime (branch `routine-habits`)
- User's idea; spec approved. Migration `20261106130000_routine_habits_anytime.sql` (weekdays nullable, no reminder for run-anytime, habit_id on steps, one-run-per-day index dropped in favour of fixed ids). Dev migrated; `rls_routine_habits.sql` passes.
- Habit steps: picked in the editor; completing completes the habit; habit already done is passed (and logged); skipping leaves the habit open; left out on days the habit isn't scheduled; deleting a habit removes its steps.
- Run anytime: no weekdays/reminder, never missed, progress kept across days, Start again; stats show times finished; journal counts its progress on the day.
- Tests: `src/routines/habits-anytime.test.ts`, more in `e2e/routines.spec.ts`. Vitest 179, Playwright 232, SQL 11 files.
- PR #13; Deploy Preview 13 checked in Chrome (run-anytime routine created, run to the end, Start again shown; test routine deleted). Prod migrated and verified. Left: merge.

## Rules without a test yet
- Profile timezone kept in step with the device (fire-and-forget update on sign-in): no automated test yet.
- Web Push delivery end to end and ntfy delivery: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.

## Decisions
See the Decisions list in `docs/SPEC.md`.
