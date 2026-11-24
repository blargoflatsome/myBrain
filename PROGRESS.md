# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- **Architecture review 2** ([docs/ARCHITECTURE_REVIEW_TASKS.md](docs/ARCHITECTURE_REVIEW_TASKS.md)): candidates 2, 1 and 6 merged. Then 4 and 5 if wanted.
- **In progress: candidate 3, server calls behind one seam** (branch `server-seam`, committed, not pushed; DECISIONS 2026-11-24 "Server calls behind one seam", SPEC §7 Things only the server can do). Built: `src/server/server.ts` (offline refusal, `ServerError` reasons, `sayWhy`), `onServer` in `src/sync/actions.ts`, brain actions for invites, cancel, drop out, answers, guest links, connections and Vault sharing (`brain.refresh` removed; `brain.syncNow` added), lint against `supabase.rpc` outside the seam, `src/tests/support/fakeServer.ts`, unit tests `src/tests/unit/server/server.test.ts`. Migration `20261124120000_limit_error_code.sql` (limits raise P0429) applied to **dev only**; `test:db` passed on dev. `test:quick` passed. **Left** (wording approved by the user 2026-11-24): at merge: code review, `test:all`, prod migration.
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
