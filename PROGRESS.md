# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- **Architecture review 3** ([docs/ARCHITECTURE_REVIEW_TASKS.md](docs/ARCHITECTURE_REVIEW_TASKS.md)): nine candidates, the user wants all of them, one branch each, order 2, 1, 3, 4, 6, 7, 8, 5, 9. Built and committed, not pushed or merged, each branch on top of the last: 2 `complete-not-toggle`, 1 `capture-through-adds`, 3 `close-raw-save` (merging it brings all three). Next: grill candidate 4. One desktop browser test failed once on a `toHaveCount` check during 3's quick run and never again (two full runs and 15 repeats of the likely two passed); its name was lost, so watch for it.
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
