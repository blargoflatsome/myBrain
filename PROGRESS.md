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

## Rules without a test yet
- Profile timezone kept in step with the device (fire-and-forget update on sign-in): no automated test yet.
- Habit and routine notify times only stored for now; the reminders themselves are step 7 (notifications).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.

## Decisions
See the Decisions list in `docs/SPEC.md`.
