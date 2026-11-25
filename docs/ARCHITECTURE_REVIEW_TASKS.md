# Architecture review tasks (review 4, 2026-11-25)

The fourth `/improve-codebase-architecture` pass, over the areas reviews 1–3 didn't cover (events, journal lock, the
Capture form, brain, settings). Review 3's list is in git history (this file before 2026-11-25). The user took all
seven candidates and every recommendation in two grilling rounds; the choices are in `docs/DECISIONS.md`
("Architecture review 4", 2026-11-25).

Build order: 2 → 1 → 3 → 4 → 5 → 6 → 7, as stacked branches from main, `/code-review medium` on each branch's own diff
when committed, one PR at the end. Mark each row here when built.

Words: **module** (anything with an interface and an implementation), **interface** (everything a caller must know),
**deep** (much behaviour behind a small interface), **shallow**, **seam**, **adapter**, **locality**, **leverage**.

| # | Candidate | Strength | Status |
|---|---|---|---|
| 2 | One rule for "my place in this event" | Strong, real bug | Built (branch `event-place`) |
| 1 | Saving an event with invitees becomes one events action | Strong | Agreed |
| 3 | One guest-messages module | Strong, small bug | Agreed |
| 4 | A Capture draft module behind the form | Worth exploring | Agreed |
| 5 | The keyring answers "is this device unlocked" | Worth exploring, small bug | Agreed |
| 6 | Sync timing in its own module; brain's leftover actions moved home | Worth exploring | Agreed |
| 7 | One helper for "save a setting, say Saved" | Speculative, small bugs | Agreed |

## 2. One rule for "my place in this event"
- **Files:** `events/rules.ts:78–81`; `dashboard/upNext.ts:85–87`; `CalendarView.vue` (`openEvent`, `:256`);
  `CancelEventDialog.vue:64`; `profiles/rules.ts:25`; `search/search.ts:75`.
- **Problem:** whether an event is mine and how I answered is worked out six ways. The server still sends an event after
  I answer No or drop out (RLS "events: invitee can read" only checks the invite isn't deleted), so Search lists it and
  opening it shows the invite again, though SPEC §5 says a No removes it.
- **Agreed:** one rule for my place (mine, pending, Maybe, Yes, No, dropped out, not shown) and one for "does this
  invitee still count" (pending, Maybe, Yes). No or dropped out hides the event everywhere on my side (calendar, Search,
  Up next, links, which open nothing); done on the device, no migration; a new invite brings it back. Up
  next keeps showing others' events only after Yes.

## 1. Saving an event with invitees becomes one events action
- **Files:** `CalendarView.vue:236–327` (`saveEvent`, `offerChangeNotice`, `notifyChange`); `events/actions.ts`;
  `events/sharing.ts`; `profiles/components/InviteToEventDialog.vue:74`.
- **Problem:** the page runs save → people → invite → change notice (with its own time compare and "still counts"
  check), so it can only be tested in the browser; the profile page invites by a second path.
- **Agreed:** one events action takes the edited row, its previous copy and the typed people, and returns who to message,
  whether to offer a change notice, and the notice counts. Telling invitees it changed is its own action that returns who
  to message. The profile page uses the same action. No change in behaviour (a save that works with a failed invite
  still saves the event and people, and says why no one was invited).

## 3. One guest-messages module
- **Files:** `CalendarView.vue:267`; `CancelEventDialog.vue:71–95`; `events/sharing.ts:98–104`; `EventPeople.vue:131`;
  migrations `fill_message`, `event_when`.
- **Problem:** subjects are English in code, not `messages.ts`; the cancel preview copies the server's template fill and
  splits `whenText` on " at "; each screen maps recipients to share targets; the new-link email's subject is the whole
  message.
- **Agreed:** one module owns the subjects (all four in `messages.ts`, drafts for the user: invited, has changed, is
  cancelled, and a new short one for a new link), the recipient → target mapping and the preview, pinned by a test to the
  server's `fill_message` output.

## 4. A Capture draft module behind the form
- **Files:** `capture/components/CaptureForm.vue` (~22 refs); `voice/parse.ts:103–106`.
- **Problem:** the form holds the draft's rules (keeping words when the type changes, each kind's defaults repeated in
  `reset()`, Undo after Speak it copying every ref); the parser checks `priority === 3`. Only browser tests reach them.
- **Agreed:** a composable, `capture/useCaptureDraft.ts`, the form binds to; defaults from each kind's blank draft
  (`blankTask`, `blankQuest`, `newHabit`); the parser uses `HIGH`.

## 5. The keyring answers "is this device unlocked"
- **Files:** `journal/useJournalLock.ts:22–26`; `journal/keyring.ts:18–24`; `journal/components/JournalLockDialog.vue:18–130`;
  `journal/JournalView.vue:164`.
- **Problem:** the hook repeats the keyring's "an earlier lock's key is never used" rule; each lock flow's step order is
  spread over five functions and tested only in the browser; JournalView counts `<p></p>` as written.
- **Agreed:** the keyring answers unlocked-for-this-lock; a step table beside `lockRules.ts`; JournalView uses `wroteIn`.

## 6. Sync timing in its own module; brain's leftover actions moved home
- **Files:** `stores/brain.ts:72–152` (`start`), `:223–352`.
- **Problem:** ~70 lines of sync timing with only a visibility test; kind actions still in brain (~60 members).
- **Agreed:** `sync/triggers.ts` (online, visibility, leaving the page, 30 s retry, realtime pull delay) tested with a fake
  clock and window. Actions move with no shim: capture and filing an Orphan → `capture/actions.ts`; finishing a quest →
  `quests/actions.ts`; Post Its → `postits/actions.ts`; events save and delete → `events/actions.ts`; alerts →
  `notifications/`; Focus and Breathe finishes → their folders. Brain keeps start, stop, online and ready. The sync
  engine stays as it is.

## 7. One helper for "save a setting, say Saved"
- **Files:** `account/AccountView.vue:292–337`; `NotificationSettings.vue:126`; `EventSettings.vue:73`.
- **Problem:** five copies of clear → `profile.update` → notice; the streak pause always says Saved; the Focus room box
  shows ticked before my profile loads.
- **Agreed:** one small helper; the pause says why when it fails; Focus room stays disabled until my profile loads.

## Tests (all candidates)
Vitest, named after the spec rule: the answer table and a declined event left out of Search; the event save through the
fake server (change notice or not, offline, in-app vs message); the cancel preview pinned to `fill_message`; the Capture
draft (type switch keeps the words, Undo after speaking, defaults); each lock flow's steps; sync timing with a fake
clock; the setting helper's notices. No new browser tests unless a refactor breaks one.
