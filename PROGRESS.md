# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- **Architecture review 4 merged** (2026-11-25, history in `docs/PROGRESS_ARCHIVE.md`). Nothing else is planned: the user dropped the wording and phone checks, the guest poll, further iPhone work and Discord invites (DECISIONS 2026-11-25). The gamifying ideas (mystery drops, combo meter, monthly challenge) are dropped too. So are the smartwatch and the calendar feed (`.ics` subscription) to evaluate; SPEC §10 has nothing planned.

## Not done yet
- Modern web guidance: the forms guide (how errors are shown and announced) wasn't compared in depth.

## Rules without a test yet
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
