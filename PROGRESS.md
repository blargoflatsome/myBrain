# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- Finish the TV app (below). Nothing else is planned (SPEC §10; dropped ideas in DECISIONS 2026-11-25).

## In progress
- **TV app (SPEC §9), stacked branches, one PR at the end (2026-11-26).** Spec on `ccr-0b2a886e-0u40iq`; each step on its own branch, built on the one before.
  - **Step 1, `tv-pairing`:** migrations `20261126010000_tv_pairing.sql` and `20261126020000_tv_pairing_per_caller.sql` (on dev; **not on prod yet**), Paired devices on the Account page and `/pair`, the TV page at `/tv/` (its own Chrome 63 build, pairing screen with QR code, night screen after 15 min).
  - **Step 2, `tv-today`:** `20261126030000_tv_snapshot.sql` and `20261126040000_tv_snapshot_today.sql` (on dev, `test:db` passes; **not on prod yet**). The dashboard: Monthly calendar (‹ › and This month) on the left, Your Day (paged) on the right, refreshed every 30 s; Up next on the night screen. Arrows move focus to the nearest button (`spatial.ts`). Up next's rules now take an Orphans count and "wrote today" (`upNextFrom`), so the TV reads no Orphan or journal text.
  - Step 2 reviewed (`/code-review medium`): fixed today's tasks missing while another month shows, far months refused, the month not rolling over on waking, multi-day event times. Skipped: checking the TV CSS and arrow focus against `modern-web-guidance`.
  - **Step 3, `tv-routines`:** `20261126050000_tv_routines.sql` (on dev, `test:db` passes; **not on prod yet**): tv_snapshot adds routine steps, run-anytime runs and step logs; `tv_save_routine_step` is the TV's one routine write. The Routines strip along the bottom and the full-screen run, sharing the phone's run flow (`useRoutineRun.ts`) and list status (`listing.ts`). Reviewed (`/code-review medium`): fixed Back losing the strip's page, calendar cells clipping items (now 2 a day plus "+N more"), and, in `20261126060000_tv_routines_review.sql` (on dev), a TV that's behind overwriting a step saved on the phone, logs for removed steps, habit days outside the run.
  - **Step 4, `tv-quest`:** `20261126070000_tv_quest.sql` and `20261126080000_tv_quest_review.sql` (on dev, `test:db` passes; **not on prod yet**). Go on a Quest at the right of the Routines strip opens a popup with the §5 picker: each Pick reads the draw fresh (`tv_quest_draw`), and `tv_save_quest` / `tv_save_draw_task` save the pick and its outcome; Mark done has Undo in place. Reviewed (`/code-review medium`): fixed links in notes that the remote could open (leaving My Brain), a repeated Undo being refused, and an unpaired TV staying on the popup. Skipped: the draw sends every open task's notes on each Pick (fine at this size).
  - Next: step 5, the Focus timer (on a branch built on `tv-quest`); then `tv-launcher/`.
  - Can't be checked here: the real TV (Tizen 5.0), including that a phone camera reads the QR code. The user tries `/tv/` on it from a deploy preview.
  - Open (SPEC §12): whether friends can use it.

## Rules without a test yet
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
