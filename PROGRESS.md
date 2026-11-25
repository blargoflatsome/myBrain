# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- **Architecture review 4 merged** (2026-11-25, history in `docs/PROGRESS_ARCHIVE.md`). Nothing else is planned: the user dropped the wording and phone checks, the guest poll, further iPhone work and Discord invites (DECISIONS 2026-11-25). The gamifying ideas (mystery drops, combo meter, monthly challenge) are dropped too. So are the smartwatch and the calendar feed (`.ics` subscription) to evaluate; SPEC §10 has nothing planned.

## In progress
- **Refused fields** (branch `test-db-by-claude`, PR 112, not merged; SPEC §5 Forms "When a save is refused", DECISIONS 2026-11-25): `useFieldError` + `v-field-error` + `FieldError` in every form that refuses one field; editors check titles and names themselves (no browser pop-up); a refused field has a red border.


## Rules without a test yet
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
