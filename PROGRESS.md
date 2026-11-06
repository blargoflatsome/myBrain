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

## Step 3 — Tasks (in progress, branch `step-3-tasks`)

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
- Merge PR #3 (user's OK).

## Rules without a test yet
- Profile timezone kept in step with the device (fire-and-forget update on sign-in): no automated test yet.
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.

## Decisions
See the Decisions list in `docs/SPEC.md`.
