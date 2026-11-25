# Progress

Current state only. Update at the end of every session; when work merges, move its section to [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) (search it for a past step's history). Build order: [SPEC §11](docs/SPEC.md#11-suggested-build-order). Decisions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Next step
- **Architecture review 4 agreed, not built** (2026-11-25): all seven candidates in `docs/ARCHITECTURE_REVIEW_TASKS.md`, choices in DECISIONS. Build as stacked branches in the order 2 → 1 → 3 → 4 → 5 → 6 → 7. Built and reviewed: candidate 2 on `event-place` (which also holds the docs), candidate 1 on `event-save` stacked on it, candidate 3 on `guest-messages` stacked on that, candidate 4 on `capture-draft` stacked on that. Next is candidate 5 on a branch stacked on `capture-draft`. Draft wording for the user to check: `messages.profile.saveFailed`, `messages.notifications.webPushOffline`, `messages.serverList`, and the guest message subject lines (`messages.guestMessages`, new: `newLinkSubject`). Dropping out: guests going aren't messaged by me; the host passes it on (spec and window wording, 2026-11-25). The drop-out push now says who dropped out (migration `20261125010000_dropout_names_who.sql`, on dev; prod at merge). Drafts to check: `messages.cancelEvent.whoDrop` and that push's title, "<name> dropped out of <event>". Idea waiting: the guest poll.
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
- Web Push delivery end to end: checked by hand after deploy (SQL checks cover who is due and what is recorded; the push function has no automated test yet).
- None else. Own-rows-only and profile auto-creation are covered by `npm run test:db` (passed on dev 2026-11-06); real Google sign-in verified on Deploy Preview 1.
