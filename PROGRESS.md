# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- Try the TV launcher on the TV (below). Nothing else is planned (SPEC §10; dropped ideas in DECISIONS 2026-11-25).

## In progress
- **TV app (SPEC §9):** merged in PR #115 (all six steps; migrations on prod 2026-11-26). Left: install the launcher on the TV (`tv-launcher/README.md`) and check there that the frame isn't refused, pairing survives a restart, the night screen stays on overnight, and a phone reads the QR code. Open (SPEC §12): whether friends can use it.

## Rules without a test yet
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
