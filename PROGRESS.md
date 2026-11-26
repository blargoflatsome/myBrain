# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- **Install on your phone merged** (PR 114, 2026-11-25): a Help topic with Android and iPhone steps and a drawn picture. **Refused fields merged** (PR 112, 2026-11-25). History in `docs/PROGRESS_ARCHIVE.md`. Nothing else is planned: the user dropped the wording and phone checks, the guest poll, further iPhone work and Discord invites (DECISIONS 2026-11-25). The gamifying ideas (mystery drops, combo meter, monthly challenge) are dropped too. So are the smartwatch and the calendar feed (`.ics` subscription) to evaluate; SPEC §10 has nothing planned.

## In progress
- **TV app (SPEC §9), stacked branches, one PR at the end (2026-11-26).** Spec on `ccr-0b2a886e-0u40iq`; step 1 on `tv-pairing`, built on it: the pairing migration `20261126010000_tv_pairing.sql` (on dev, `test:db` passes; **not on prod yet**), Paired devices on the Account page and `/pair`, and the TV page at `/tv/` (its own Chrome 63 build, pairing screen, night screen after 15 min). Shared fix: `hourOf` in `src/time/days.ts` reads 12-hour answers from engines without `hourCycle`.
  - QR code added (`qrcode-generator` 2.0.4, user OK'd). Check on the TV that a phone camera reads it.
  - Next: step 2 (Your Day, the Monthly calendar, Up next on the night screen) through a `tv_snapshot` function; then Routines, Quest, Focus, `tv-launcher/`.
  - Can't be checked here: the real TV (Tizen 5.0). The user tries `/tv/` on it from a deploy preview.
  - Open (SPEC §12): whether friends can use it.

## Rules without a test yet
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
