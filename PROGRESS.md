# Progress

Tracks build steps from [docs/SPEC.md §11](docs/SPEC.md#11-suggested-build-order). Update at the end of every session.

Older steps (1–11, feedback rounds 1–3, connections, navigation, Account tidy-up and the rest up to PR #41) are in [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md). Keep this file to the current state plus the last few pieces of work; move older sections to the archive.

## iPhone support, Phase 3 (branch `iphone`)
- Stays a web app. Browser tests now also run as an iPhone (Playwright WebKit "iPhone 14", service workers off there because WebKit sends service-worker requests past the stand-in server); CI installs WebKit too. Fixed for iPhone: text links (`sms:NUMBER&body=`), full-screen Home Screen tags and safe-area padding, persistent storage request, an iPhone-specific Reminders message when not installed. Docs "On an iPhone" section; Features mentions iPhone. Tests skipped on iPhone only where they don't apply (mouse hover/drag, Tab to links, Chrome-only touch, long clock fast-forwards that take over a minute on WebKit).
- Still to check on a real iPhone (user): Google sign-in returning to the installed app, voice capture, push reminders arriving.
- Vitest 286, Playwright 898 (3 profiles).

## Type it like you'd say it + feedback round 4 (merged via PR, branch `natural-capture`)
- Type it like you'd say it: removed before release (user: guessing would get things wrong or make people learn how to type). Revisit later.
- Feedback round 4 (SPEC §14 2026-11-10): close ✕ in every window (`CloseX.vue`) and click-outside closing (`closeOnOutsideClick` in `src/a11y/focus.ts`); More details fold-outs (`MoreOptions.vue`) in Capture and the task, habit, event, quest, Vault and priority editors; formatted notes (`NotesEditor.vue`, `RichNotes.vue`, `storedNotes`/`textLines` in `journal/body.ts`; search reads words only, calendar files get plain lines); one date/time display (`dayLabel`, `timeLabel`, `dayTimeLabel`, `momentLabel` in `ui/dates.ts`); type-or-pick date box (`DateInput.vue`, `time/parseDate.ts`); shared habit form (`HabitFields.vue`: repeats on with how often, bordered Reminders box); journal tomorrow box as big as the writing; quests stay after done (`quest_logs`), Pick and delete in the list, done count, yesterday's quests on the Dashboard; calendar opens on the month, read-only item window (`CalendarItemDialog.vue`) with Edit in place; Delete my data in orange (`--warning`).
- `npm run test:db` passed (user ran it, 2026-11-10).
- Migration `20261110010000_quest_logs.sql` (quest_logs, done quests back to open with their completion logged, priority description limit 20,000). Dev migrated. `supabase/tests/rls_quest_logs.sql` written; `npm run test:db` passes. Prod migrated 2026-11-10 (quest_logs and task_cleared; second push confirms up to date).
- Tests: `src/feedback-round-4.test.ts`, `e2e/feedback-round-4.spec.ts`, calendar-item scan in `e2e/a11y.spec.ts`; many existing browser tests updated for the new layout and for the user's own wording edits in `messages.ts`.
- Tests in two levels: `npm run test:quick` while coding; `npm run test:all` (three devices) only when the user says merge, merging only if it passes.
- Calm by design (SPEC §2, user approved with tweaks): warm palette with soft blue accent and muted status colours (`style.css`, `priorityDot`); outline icons (`AppIcon.vue`, `ui/icons.ts`) instead of emoji; shorter hints and "Save task"-style buttons (user's joke lines untouched); more spacing, 1.5 line height, no italics; Undo bar (`stores/undo.ts`, `UndoBar.vue`) replacing confirmations for single deletes and list clears (events with guests, habits, routines, buckets, Delete my data and Delete My Account still confirm); Dashboard key numbers and favorite buckets first, the rest in More stats; More details in routine and bucket editors. Tests `src/stores/undo.test.ts`, `e2e/calm-ux.spec.ts`.
- UI consistency round: one soft check-mark choice style (`selected`/`.choice-on`); routine form laid out like habits; Edit button on every task and priority row (`rowAction`); priority tasks always in the future (`firstFutureDay`, `isLater`); Vault notes under title, bucket in More details; pink Post Its removed; Dashboard key row = days since worst day, longest current streak, best streak ever, smaller yesterday numbers.
- Test cleanup (user asked): removed 16 browser tests and 1 unit test that repeated others or checked removed features (titles and sideways scroll repeated in app-shell, the old notifications box, Profile and Inbox address renames, "no tags here", "no Add box", "no Add a task for tomorrow", a second habit-editor axe scan, duplicate every-2-weeks, Capture habit, Undo, calendar task and ✕ tests, simple menu-link checks). Desktop quick suite: 318 tests, about a minute.
- Features and Docs pages removed until the app is finished (user, to save tokens).
- Merge review (2026-11-10): first `npm run test:all` had 3 failures. Two were a real race: journal saves for the same day running at once (writing + tomorrow box, quick Yes/No taps) could each create an entry, giving two entries for one day. Fixed by running a day's journal saves one at a time (`oneAtATime` in `stores/brain.ts`); test in `src/stores/brain.test.ts`. Second run found two more races: a pull that began before my latest change uploaded could put the older server copy back over it (Yes/No flipping back); pulls now never replace a row with an older `updated_at` (`pullTable` in `sync/engine.ts`, test in `engine.test.ts`). And a routine opened before its steps downloaded showed one blank step (saving could drop the steps); the editor now fills them in when they arrive if the blank step is untouched (`RoutineEditor.vue`, test in `e2e/routines.spec.ts`). `npm run test:db` passes (26 files); dev migrated.
- Clear crossed-off tasks (user chose hide, keep history): `tasks.cleared_at` (migration `20261110020000_task_cleared.sql`, dev migrated), `clearDone`/`clearedForDay` in `tasks/rules.ts`, button on the Tasks page.

## Header and token savings (merged via PR, branch `header`)
- SPEC §2 Header (user's choices, 2026-11-10): `AppHeader.vue` on phones and wide screens: Account (profile picture or person icon, falls back if the picture fails), Focus timer (stopwatch), alerts bell, Sign out (asks first), sync status (dot only on phones). Phones keep My Brain and Search there; wide screens keep them in the side menu. Account and Focus timer left More. Icons wrap onto a second line on very narrow screens.
- Also on this branch: token savings (SPEC decisions moved to `docs/DECISIONS.md`, old progress to `docs/PROGRESS_ARCHIVE.md`, reading rule in CLAUDE.md).
- Tests: `e2e/header.spec.ts`; `goTo('Account')` now uses the header. Quick checks pass; Android checked for the changed tests. `npm run test:all` passed (2026-11-11): Vitest 319, Playwright 958 (3 profiles).

## Header on one line, sign out moved (merged via PR, branch `header-one-line`)
- User: everything on one line; on phones a Home icon instead of "My Brain". Controls 44 px, 40 px under 360 px wide; nothing wraps at 320 px (SPEC §2 Header, DECISIONS 2026-11-11). Tests in `e2e/header.spec.ts` at 320, 360 and 412 px.
- Sign out removed from the header (user); on the Account page it's now its own always-visible row right under Your profile, out of the Account group with Delete account. Test in `e2e/account-layout.spec.ts`. `npm run test:all` passed (2026-11-11): Vitest 319, Playwright 967.

## Targeted phone tests (merged via PR, branch `phone-tests`)
- Android and iPhone run only device-sensitive browser tests: whole files in `PHONE_FILES` (`playwright.config.ts`) plus `@phone` tags (SPEC §3, DECISIONS 2026-11-11). `npm run test:all` passes: 671 browser runs (was 967), 3.8 min (was 4.4).

## Rules without a test yet
- Profile timezone kept in step with the device (fire-and-forget update on sign-in): no automated test yet.
- Web Push delivery end to end and ntfy delivery: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.

## Decisions
See [docs/DECISIONS.md](docs/DECISIONS.md).
