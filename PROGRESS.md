# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## In progress: one way to read rows (branch `live-rows`)
- Architecture review (`/improve-codebase-architecture`), then grilled with the user (DECISIONS 2026-11-24 "One way to read rows"). New `src/sync/useRows.ts`: `useRows`, `useRow`, `useDeviceQuery`, `readRows`, `findRow`; every read hides deleted rows unless asked, and so do `readTables` and the new `getRow`. All 27 pages switched; lint stops pages reading `brain.db` or using `useLiveQuery`. Bundles: `journal/dayData.ts`, `vault/useVisibleBuckets.ts`.
- Fixes: the routine run page says it can't find a deleted routine; Up next, the priority reminder, routine steps and the default bucket ignore a row deleted a moment earlier. Behaviour change (SPEC §5 Firsts): an undone quest no longer counts toward the quest First.
- Tests: `unit/sync/useRows.test.ts` (deleted hidden, signed out, follows sign-in, deleted row by id), a First case in `celebrate.test.ts`, trophy history from the device in `trophies.test.ts`. `npm run test:quick` passes. Help and the home page need no change (nothing a page does changed).
- Also pushed, not merged: branch `retro-architecture-skills` (the /retro and /improve-codebase-architecture skills).

## Next step
- Voice capture is merged. Pick the next step with the user (idea waiting: the guest poll).
- **Needs from the user:** the Cheers smug lines (`messages.cheers.afterReact`, `messages.cheers.subtitle`, and the unstuck alert, which lives in `post_cheer` in the migrations, so changing it is a small migration) and the Cheering others on trophy names and "You…" lines (`celebrations.trophies.names` / `about` / `earnedAbout`: cheers_given, cheer_days, cheer_firsts, cheer_unstuck, cheering_while_stuck). All are plain placeholders. The I'm stuck lines (`messages.cheers.stuckLines`) are sincere drafts for the user to check.
- **Small gap:** Download my data doesn't include Cheers posts (they live only on the server and expire after 48 hours).

## Still to try on a real phone (user)
- Voice capture: real speech (Android and iPhone).
- iPhone: Google sign-in returning to the installed app; push reminders arriving.
- The 9 pm evening-reminder push arriving.
- A real passkey for the journal lock (PRF support varies by phone and password manager).

## Not done yet
- Modern web guidance: the forms guide (how errors are shown and announced) wasn't compared in depth.

## Rules without a test yet
- Profile timezone kept in step with the device (fire-and-forget update on sign-in): no automated test yet.
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
