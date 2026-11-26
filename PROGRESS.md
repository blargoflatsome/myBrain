# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- Try the TV launcher on the TV (below). Nothing else is planned (SPEC §10; dropped ideas in DECISIONS 2026-11-25).

## In progress
- **Routines run any time, branch `routines-anytime` (on top of `tv-feedback`; not merged):** any routine with steps can start any day (an off-day run leaves its stats and streak alone), a finished one offers Start again (the day counts once), scheduled routines are listed first, and today's unfinished scheduled routines show in the TV's Your Day (SPEC §5 Routines, DECISIONS 2026-11-26).
- **TV feedback, branch `tv-feedback` (not merged, no PR yet):** the dashboard fits one screen at 1920×1080 (Your Day above Routines on the right, Go on a Quest and Focus timer side by side under them); Your Day lists what's left of today, titles only: events, open tasks, habits due today, each leaving once passed or done, then "You did good today, get some rest"; the clocks are 12-hour with a small am/pm. Reviewed (`/code-review medium`): fixed a missed or paused habit making the day "all done", and row kinds told by colour alone. Also fixed (QA on the TV): Completed on a routine step failed ("can't reach My Brain") because the TV sent a parameter the server function doesn't take; the browser tests' stand-in server now refuses any call the real one would (`rpcProblem` in `fakeSupabase.ts`). To check on the TV: it fits (the one-screen layout needs a page of at least 1800×1000; check the TV's size if it still scrolls) and the calendar stretches to the bottom.
- **TV app (SPEC §9):** merged in PR #115 (all six steps; migrations on prod 2026-11-26). Left: install the launcher on the TV (`tv-launcher/README.md`) and check there that the frame isn't refused, pairing survives a restart, the night screen stays on overnight, and a phone reads the QR code. Open (SPEC §12): whether friends can use it.

## Rules without a test yet
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
