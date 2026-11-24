# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## In progress: docs review (branch `grill-with-docs-skill`)
- Added the grill-with-docs skill (with grilling and domain-modeling). Reviewed the spec against the code with the user (DECISIONS 2026-11-24): new GLOSSARY.md; SPEC §4 matches the migrations; Connections moved into §5; email sending and Home Assistant dropped; README and .env.example updated.
- Code: Firsts say "New trophy: …"; unused confirmation messages removed; migration `20261124010000_no_email_for_app_users.sql` (app users get push only, `event_notify_method` dropped) applied to **dev**, `test:db` passes. Not on prod yet.
- **At merge:** Help and home page say "bucket" not "list" and "connections" not "friends" (`messages.ts` Help/home text, `invites.peopleHint`); add Cheers to Help's Getting around; push the migration to prod.

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
