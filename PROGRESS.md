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
- PR #13; Deploy Preview 13 checked in Chrome (run-anytime routine created, run to the end, Start again shown; test routine deleted). Prod migrated and verified. Merged and live.

## Step 10 — Dashboard (done, PR #14)
- The Raspberry Pi display moved to an optional later step (user). Spec §5 Dashboard approved.
- Dashboard is the first page (Tasks at /tasks): period dropdown (This year default, Last 12 months, All time; remembered on the device); habits (every habit's current/best streak, top 3 most missed, longest current, best ever, oldest); journal current/best streak (written entries only); events created/attended/cancelled; tasks done, quests finished, routine completion rates.
- No database change. Tests: `src/dashboard/stats.test.ts`, `e2e/dashboard.spec.ts`; Tasks tests now open /tasks. Vitest 188, Playwright 244.

## Step 11 — Shared events (done, PR #15)
- Spec approved (user's choices: Resend from an own domain; one merge; calendar file for guests; phone unverified).
- Decided 2026-11-07: buy `myadhdbrain.app` at Porkbun and set up Resend as a **Phase 2 step**. Step 11 queues and logs emails and reaches guests through the one-at-a-time sharing flow.
- Migrations `20261107000000_shared_events.sql` (+ `..000100_invite_recipients_own.sql`): profile settings (findable, share availability, two cancellation messages), `events.cancelled_at`, `event_invites` + private `invite_recipients` (host never learns who has an account), availability rules/exceptions, `outbound_messages` log/queue + `message_optouts`, server functions (search, invite, answer, guest page, messages, cancel, drop out, free/busy, mark shared), `send_outbound` cron (push/ntfy to app users; email/text wait). Dev migrated; `rls_shared_events.sql` passes.
- App: one-time phone step; Account: event settings, availability card, Download my data, privacy/terms links; public privacy, terms and guest answer pages (with .ics download); event editor People (name search, email/phone, contacts, free/busy + suggested times); one-at-a-time share flow (email app / messaging app); invitee view (answer, message, drop out); Cancel and notify with personal messages; calendar styles for invites; dashboard event stats use real answers.
- Tests: `src/events/sharing.test.ts`, `e2e/shared-events.spec.ts`, dashboard stats. Vitest 197, Playwright 270, SQL 12 files.
- Delete my data (user): `delete_my_data()` (migration `20261107000300_delete_my_data.sql`) deletes the ticked parts (checklist, all ticked to start; Vault back to 3 starters; migration `..000400_delete_my_data_parts.sql`), keeps account, settings, availability, invitations received, events with invitees, message log; `profiles.data_reset_at` makes other devices clear and re-download. `rls_delete_my_data.sql` passes. Not run on the preview (it would wipe real dev data); covered by SQL and browser tests.
- PR #15; Deploy Preview 15 checked in Chrome on dev: phone step appears; event with a fake guest; real invite link; guest answered Yes on the public page; Cancel and notify listed the guest with the personal message; emails logged as waiting (not sent); test event deleted. Fixed "at all day" wording. Prod migrated and verified. Merged.

- Phase 2 gains a tags management page (user).

## Feedback round 1 (done, PR #16)
- User feedback, spec approved 2026-11-07: every week / every 2 weeks for habits, routines, repeating priority tasks and events (2-week weeks count from the start date's Sun–Sat week); Capture can add a habit (full form); Inbox renamed Orphans (`/inbox` redirects); streaks removed from the Account page; Journal gets "How to make tomorrow better?" and "Was today better than yesterday?" Yes/No; Dashboard "Days since your worst day" (days in a row answered Yes); star several Vault buckets, each shows on the Dashboard with its 3 newest items.
- Migration `20261107010000_feedback_round_1.sql` (`week_interval`, `on_week()`, events `biweekly`, journal `tomorrow`/`better_than_yesterday`, buckets `starred`, reminders respect every 2 weeks). Dev migrated; `rls_every_two_weeks.sql` passes (14 SQL files).
- Tests: `src/feedback-round-1.test.ts`, `e2e/feedback-round-1.spec.ts`. Vitest 205, Playwright 298.
- Part 2 (user, same PR): journal asks better-than-yesterday before the writing; tomorrow box is the formatted editor; Earlier entries show tags at the top; Vault items have a delete button in the list (confirm).
- Sync fix (phone edits only reached the desktop after reopening the phone): sync when the app comes back into view, save waiting writing and upload when it's hidden, retry queued changes every 30 s (SPEC §7).
- WCAG 2.2 AA (SPEC §2, CLAUDE.md): `e2e/a11y.spec.ts` runs axe on every page and main window in light and dark, plus reflow at 320 px, titles, skip link, focus ring, tap-to-move and page announcements. Fixed everything it and a manual review found (see SPEC §14 2026-11-07).
- Part 3 (user): removed the Journal's Add a task for tomorrow button; focus trapped in every window and returned on close (`src/a11y/focus.ts`, phone menu included); tests prove focus escapes without it.
- Tests: Vitest 205, Playwright 417 (3 skipped, phone-only/desktop-only).

## Dashboard: yesterday (done, PR #17)
- "Do better today than past you did yesterday" at the top of the Dashboard: yesterday's habits kept, routines finished, tasks done (x of y), and each routine's steps done; says so when nothing was scheduled (user's choices, SPEC §5 Dashboard). No database change.
- Tests: `src/feedback-round-1.test.ts` (summary), `e2e/dashboard.spec.ts` (section first, counts, empty); Dashboard passes the axe scan. Vitest 207, Playwright 421.

## Desktop time picker (done, PR #18)
- Spec decision logged: Nuxt UI not adopted; Reka UI piece by piece if needed.
- `TimeInput` (src/components/TimeInput.vue, src/time/parse.ts): type or pick from a 15-minute list on a computer; device picker on touch screens. Replaces all 13 time fields.
- Tests: `src/time/parse.test.ts`; time field tests and an axe scan of the open list in `e2e/a11y.spec.ts`. Vitest 229, Playwright 427 (9 skipped: phone-only/computer-only).

## Post It (done, PR #19)
- New Capture type and Dashboard sticky notes (user's choices: all shown newest first; edit in place, Done with Undo, Make a task, reorder; 4 colors; not in search; in Delete/Download my data). SPEC §4, §5, §8, §14.
- Migration `20261107020000_post_its.sql` (table, RLS, Realtime; `delete_my_data` gains a Post Its part). Dev migrated; `rls_post_its.sql` passes (15 SQL files).
- App: `post_its` sync table (Dexie v8), `src/postits/rules.ts`, store functions, Capture form (editor + color), `PostItBoard` at the top of the Dashboard; RichTextEditor gains `autofocus`.
- Tests: `src/postits/rules.test.ts`, `e2e/post-it.spec.ts`, Delete my data and axe scans updated. Vitest 232, Playwright 445.

## Post It look (done, PR #20)
- Post Its look taped on (tape strip, tilt, shadow); several form a stack showing one at a time with the notes underneath peeking out; Previous/Next, swipe, arrow keys, "2 of 5", never automatic; Move earlier/later replaces dragging; Edit / Make a task / Done sit under the note. Checked in screenshots (light/dark, desktop/phone).
- Tests: `e2e/post-it.spec.ts` (stack, look, swipe, keys, move). Playwright 449.

## Post It swipe fix (done, PR #21)
- Swiping didn't work on a real phone: the browser took the sideways drag as a page gesture and cancelled the touch. The stack now allows only vertical page scrolling (`touch-action: pan-y`), so sideways swipes reach it. The old test faked pointer events; the new one sends real touch input (Chromium touch events) on the phone project, and failed before the fix.
- Then (user): phones lose Previous/Next and get tappable dots (swipe needs a tap alternative, WCAG 2.5.1); Move earlier/later removed everywhere (notes stay newest first; store reorder removed). Playwright 446.

## Post It arrows (done, PR #22)
- Computer: Previous/Next are arrows beside the stack, shown on mouse over or keyboard focus, none past either end (focus moves to the other arrow); "2 of 5" below. Checked in a screenshot. Tests in `e2e/post-it.spec.ts` (hover and focus reveal, position, keyboard).
- Then (user): Done became an X in the note's top right corner (delete, with Undo); Edit became a pencil icon bottom left; Make a task removed (store, rules and tests). Checked in screenshots.
- Then (user): the yesterday block is renamed "How past you did yesterday" and sits left of the Post Its on wide screens (xl, 1280 px+; Dashboard widens to 5xl there); stacked below on narrower screens. Checked in screenshots at 1440 and 1100 px.
- Phone side-scroll fix (user report): favorite bucket cards and the tilted Post Its underneath pushed the Dashboard sideways. Fixed (grid columns can shrink, cards min-w-0, padding round the stack on phones, `overflow-wrap: anywhere` site-wide). New rule (user): test typed text long; `e2e/a11y.spec.ts` now seeds a long sentence, paragraph and unbroken link for every kind of typed text and names the offending element when a page scrolls sideways. Confirmed the test fails without the fix.

## Security sweep (done, PR #23)
- User asked for a sweep of all inputs (entities, injection, other attacks). Audit and fixes recorded in SPEC §8 and §14.
- Migrations `20261107030000_security_limits.sql` (size limits NOT VALID, https-only picture and push addresses, journal tomorrow limit raised) and `..030100_search_people_fix.sql` (the first one's search pattern was an invalid regex and broke search on dev; caught by the SQL checks and fixed with translate()). Dev migrated; 16 SQL files pass.
- App: `public/_headers` (CSP etc., also used by `vite preview` through `build/security-headers.ts`), push allowlist (`src/notifications/pushEndpoints.ts`, used by the app and `send-push`), constant-time secret, `src/security/redirect.ts`, calendar escaping, DOMPurify checkbox fix, input maxlengths, `fitTitle` for long titles.
- Tests: `e2e/security.spec.ts`, `src/security/security.test.ts`, `supabase/tests/rls_security.sql`. Vitest 266, Playwright 463.

## Code review and coding standards (done, PR #24)
- `docs/CODING_STANDARDS.md` (for the user to review and tweak). Templates before scripts in every .vue file; ESLint `vue/block-order` enforces it.
- Shared code: `src/ui/styles.ts` (16 copies of the field style, 5 chip copies, 3 answer-button copies, window and card styles), `src/ui/dates.ts` (5 copies of date formatting), `src/sync/live.ts` (two identical helpers and 14 inline filters), `ConfirmDialog.vue` (9 copied confirmation windows).
- Dead code removed: the Journal preset in Capture (left from the removed Add a task for tomorrow button), the capture `source` option, `newInviteLink`. `needsDecision` is now used by the task row instead of being re-implemented inline. `READ_ONLY_TABLES` is now enforced by the sync engine (it was declared but unused).
- Comments: removed ones that repeated a heading or the code, and who-approved-what notes (the decision log has them).
- Performance: the formatting editor (Tiptap) loads on first use; initial download 702 kB to 373 kB (211 kB to 109 kB compressed).

## Feedback round 2 (done, PR #25)
- User's choices (SPEC §14 2026-11-07): journal save status next to the heading (`SaveStatus.vue`); clearer invite feedback (contact picker results, "To invite (when you save)", ready and shared messages); app checks for updates hourly and on return (the user's phone was on an old version without "Every 2 weeks" for events); Quest page redesign (soft filter chips, compact list, easiest first, 10 per page); reusable `usePagination` + `PageControls.vue`; Vault buckets favorites first then A to Z everywhere (bucket dragging removed); Today's notifications on the Dashboard (5 per page, clear one or all, cleared at midnight).
- Migrations `20261107040000_notifications_today.sql` (notifications table, `record_notification`, `expire_notifications` hourly cron, senders record every reminder and event news) and `..040100_record_notification_fix.sql` (parameter names clashed with columns and broke reminder runs on dev for a few minutes; caught by the SQL checks). Dev migrated; 17 SQL files pass.
- Tests: `src/feedback-round-2.test.ts`, `e2e/feedback-round-2.spec.ts`, `supabase/tests/rls_notifications.sql`; updated Vault, Capture, journal and accessibility tests. Vitest 270, Playwright 477.
- User said yes to remembering people already invited (next section).

## Remembered people (done, PR #26)
- The invite form suggests people I've invited before by email or phone (up to 5, matching name, email or phone; once per person, latest name; not ones already on the event). From my own invitations on the device; no database change. `rememberedPeople` / `matchRemembered` in `src/events/contacts.ts`. Tests: `src/events/remembered.test.ts`, `e2e/feedback-round-2.spec.ts`. Vitest 272, Playwright 479.

## Feedback round 3 (done, PR #27)
- Habits: start date + every week / every 2 weeks / every month (user's choice: by the start date's day); `habit_on()` on the server, `isScheduled`/`onMonthDay` in the app; habit editor and Capture form. Events start at the next whole hour (All day was hiding the time boxes). Tags only on tasks, habits, routines (old links deleted, user's choice); search finds habits and routines. Journal Earlier 3 per page; save status under each box. Focus timer (Pomodoro): `src/focus/timer.ts`, `stores/focus.ts`, `FocusTimer.vue`, design by Claude for the user to react to.
- Migration `20261107050000_round_3.sql`. Dev migrated; 18 SQL files pass.
- Tests: `src/feedback-round-3.test.ts`, `e2e/feedback-round-3.spec.ts`, `supabase/tests/rls_round_3.sql`; tag and Vault tests updated. Vitest 280, Playwright 513.

## Features and Docs pages (done, PR #28)
- Public `/features` (marketing summary of every feature) and `/docs` (how to use each feature, with a Work/Personal tags example). Linked from sign-in, Account and Help in the menu. Standard added: update both with every functionality change (CLAUDE.md, SPEC, coding standards, memory). Tests: `e2e/features-docs.spec.ts`, accessibility scans. Playwright 527.

## Pick from contacts fix (done, PR #29)
- User bug report: on the phone, picking a contact never filled the form. Cause: Android's "back" as the picker closes closed the event window. The event window now ignores "back" while picking and for a second after (`contactPickerOpen` in `src/events/sharing.ts`). One contact fills the boxes ready for Add; several are all added (only the last was kept before); nothing picked says so; messages scroll into view. Tests: `e2e/contact-picker.spec.ts` (stand-in phone picker that hides the page and sends "back"). Vitest 280, Playwright 539. Not yet tried on a real phone.

## Pick from contacts follow-ups (done, PRs #30, #32)
- #30: the app says when the phone closed it while picking (reopens the event) or when no contact arrives within 4 seconds. #32: a test page on the user's phone (draft PR #31, preview only, kept for re-testing) showed Chrome 157 with Samsung's contact list answering an empty list the moment the list opens; the app now says Chrome blocked it. Bug report text given to the user to file with Chrome. Flaky accessibility checks steadied (they opened windows before the page was ready). Seen in tests only, not fixed: opening the Capture window in the first moment after a page loads can let Tab reach the + Capture button behind it.

## Share a contact into My Brain (done, PR #33, then removed)
- Worked once the phone's app registration was refreshed, but the user found it an awful experience; removed in the next change along with Pick from contacts.

## My people (done, PR #34)
- Pick from contacts and sharing a contact in are gone (code, tests, share target back to GET /capture). Guests are typed once; saving the event saves them to **my people** (new `people` table, Dexie v10, synced; same email/phone = same person, new name replaces old). The event's People section lists my people A–Z, 10 per page, filtered by what I type, with Add buttons; already invited or waiting people aren't listed. Account page has a People section to add (duplicates flagged), edit or remove (confirmation). Replaces the remembered-people suggestions. Delete my data has a "Your people" part. Privacy page mentions it.
- Migration `20261108010000_people.sql` (table, RLS, Realtime, one-time import of everyone already invited by email/phone, delete_my_data part). Dev migrated; 19 SQL files pass. Prod: applied right before merge.
- Tests: `src/events/people.test.ts`, `e2e/my-people.spec.ts`, `supabase/tests/rls_people.sql`; delete-my-data and accessibility tests updated. Vitest 284, Playwright 547.

## Contacts window (done, PR #35)
- The People section has a **Contacts** button that opens `ContactsDialog.vue`: my people A–Z, search as you type, Add per person (stays open; Added with Undo; already invited shows Invited), Done. The typing form only adds. Finding My Brain users by name moves to Phase 2 (people need to match first), and with it the availability schedule, free/busy checks, suggested times, and the findable and share-availability settings (screens and client code removed; tables and server functions kept). Docs, Features and Privacy updated.
- Tests: `e2e/my-people.spec.ts` rewritten for the window, Contacts window added to the accessibility scans, availability/name-search tests removed. Vitest 281, Playwright 545.

## Connections, parts 1–5 (done, PR #37)
- Migration `20261108020000_connections.sql`: `connection_requests`, `connections`, `connection_blocks` (functions only, no direct access); `request_connection` (same answer whatever is typed, 20 a day), `incoming_connection_requests`, `sent_connection_requests`, `answer_connection_request` (accept/decline/block), `cancel_connection_request`, `my_connections`, `remove_connection`; `invite_people` now invites only connections in the app (typed addresses of anyone else are guests); Delete my data part. Dev migrated; 20 SQL files pass (`rls_connections.sql`; two older tests now connect their users first). Prod: before merge.
- App: `/connections` page (`ConnectionsView.vue`, `src/events/connections.ts`), link on Account, connections first in the Contacts window ("On My Brain"). Tests: `e2e/connections.spec.ts`, a11y scan. Vitest 281, Playwright 559 (one known journal flake).
- Part 2 (same branch): migration `20261108030000_connect_links.sql` (`connect_links`, code tries; create/list/cancel/preview/use; only hashes stored), `/connect/:token` page, Make a link and Have a code? on the Connections page, return to the link after sign-in. `rls_connect_links.sql`; 21 SQL files pass on dev.
- Part 3 (so far): migration `20261108040000_connect_from_people_and_guests.sql` (`people_with_accounts`, `guest_connect_offer`, `guest_connect_with_host`); Connect buttons on saved people (Account, Contacts window) and on the guest page. `rls_connect_part3.sql`; 22 SQL files pass on dev.
- Part 3 (done): who's going — migration `20261108050000_event_attendees.sql` (`events.show_guests`, `event_invites.visible`, `event_attendees`, `connect_via_event`, `set_event_visibility`); list with Connect in the invitee window, host checkbox. `rls_event_attendees.sql`; 23 SQL files pass on dev.
- Part 4 (done, except "Just this date" for repeating events): migration `20261108060000_guest_links.sql` (link lifetime, `guest_invite.passed`, `guest_claim_status`/`claim_guest_invite`, `link_invites_between` on connect, `event_changed`, 'update' message kind); guest page passed/sign-up/claim/accept-as, host New link (existing `new_invite_link`), Let everyone know. `rls_guest_links.sql`, `e2e/guest-links.spec.ts`; 24 SQL files pass on dev. Found and fixed: saved times (19:00) vs stored (19:00:00) would have asked on every save.
- Part 5 (done): migration `20261108070000_scheduling_for_connections.sql` (`free_busy` only for connections); availability card, share setting, free/busy and suggested times restored from before PR #35, now for connections. `rls_scheduling.sql`; 25 SQL files pass on dev.
- Not built: "Just this date" answers for repeating events; push for connection requests.

## Dev test accounts (branch `dev-test-accounts`)
- `scripts/dev-accounts.mjs` (`npm run dev:accounts`), `scripts/test-flows.mjs` (`npm run test:flows`), shared `scripts/dev-env.mjs` (refuses production). Dev-only password sign-in (`DevSignIn.vue`, `src/auth/devSignIn.ts`, unit test). Waiting on the user: the dev service role key in `.env.local`, and Email sign-in turned on in the dev Supabase project; then run `npm run dev:accounts` and `npm run test:flows`.

## Rules without a test yet
- Profile timezone kept in step with the device (fire-and-forget update on sign-in): no automated test yet.
- Web Push delivery end to end and ntfy delivery: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.

## Decisions
See the Decisions list in `docs/SPEC.md`.
