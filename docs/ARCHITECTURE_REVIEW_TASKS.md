# Architecture review tasks (2026-11-24)

The second `/improve-codebase-architecture` pass (the first gave `useRows`, DECISIONS 2026-11-24 "One way to read rows").
Six candidates, ranked. Nothing here is decided or built yet. Step through them one at a time: grill the user on one,
record the choices in `docs/DECISIONS.md` (and `docs/SPEC.md` if behaviour changes), build it on its own branch, then
mark it here. A candidate the user turns down gets its reason here and in DECISIONS so later reviews don't re-suggest it.

Words: **module** (anything with an interface and an implementation), **interface** (everything a caller must know),
**deep** (much behaviour behind a small interface), **shallow**, **seam**, **adapter**, **locality**, **leverage**.

**Order:** 2 first (small, fixes a real bug), then 1 (both decide who writes `activity_log`), then 3. 4–6 later or never.

| # | Candidate | Strength | Status |
|---|---|---|---|
| 1 | One module for "I finished it" | Strong | Merged (branch `finish-module`) |
| 2 | Deletes that return their own Undo | Strong, real bug | Merged (branch `undo-from-deletes`) |
| 3 | Server calls behind a seam that keeps my copy up to date | Strong | To do |
| 4 | One module for the signed-in session's lifecycle | Worth exploring | To do |
| 5 | Close brain's raw `save`; tasks, quests and Post Its get their own actions | Worth exploring | To do |
| 6 | One capture path, Post Its included | Speculative | Done with 1 |

## 1. One module for "I finished it"

- **Files:** `src/stores/brain.ts` (`capture`, `convert`, `finishQuest`, `addPostIt`), `src/celebrate/bus.ts`
  (`achieved`, 17 call sites), `src/stores/celebrate.ts` (`handle`, `earnBadge`, `checkTrophies`),
  `src/trophies/actions.ts` (`logActivity`); screens `CheersView.vue`, `FocusTimer.vue`, `BreatheWindow.vue`,
  `CaptureForm.vue`; `src/events/sharing.ts:58`.
- **Problem:** `activity_log` (what Trophies count) is written by three owners: brain, a screen (`CaptureForm.vue:339`
  logs `capture` for a Post It because `addPostIt` doesn't), and the celebration listener
  (`stores/celebrate.ts:246, 249` writes the Focus and Breathe rows). With no listener running, a finished Focus or
  Breathe session never reaches `activity_log`. Screens trigger trophy re-checks (`CheersView.vue:234`). Each of the
  17 callers must know which `kind` to fire, only on the open→done change, and whether an activity row is needed too.
  Tests sleep 50 ms (`celebrate.test.ts:145, 299`) because the work is fire-and-forget.
- **Deletion test:** deleting `bus.ts` doesn't concentrate anything; the complexity already sits in ~17 callers.
- **Deeper module would hide:** "I finished X" as one write: save the row, record the activity Trophies need,
  announce. The celebration listener only celebrates.
- **Tests:** "finish a Focus session" → check `activity_log` and the First, no celebration store, Pinia or sleeps.

- **Decided (user, 2026-11-24):** (B) a trophy keeper (`src/trophies/keeper.ts`, started by `brain.start`) saves
  Firsts, trophy levels and the two alerts and says what it earned; `stores/celebrate.ts` only shows. Finishing waits
  for the row and its activity; `brain.trophiesIdle()` for tests. `brain.finishFocus` / `finishBreathe`; Post Its from
  Capture through `brain.capture` (6 folded in); Cheers `shareCheer` / `cheerOn` recheck trophies; lint stops `.vue`
  files importing `achieved`. DECISIONS 2026-11-24 "One module for I finished it".

## 2. Deletes that return their own Undo

- **Files:** `src/stores/undo.ts` (`offer`, 23 call sites), `src/stores/brain.ts:235–243, 326–333` (`removeOrphan`,
  `afterOrphanGone`, `remove`, `restore`); screens `InboxView.vue:69`, `TasksView.vue:266`, `QuestsView.vue:244`,
  `VaultView.vue:253, 257, 262`, `MyPeople.vue:122`, `CalendarView.vue:227, 325`, `PostItBoard.vue:251, 259`.
  Model to copy: `tags/actions.ts` `deleteTag` / `mergeTags` return their undo (`TagsView.vue:64, 68`).
- **Problem:** screens pair `brain.remove(table, id)` with `undo.offer(msg, () => brain.restore(table, id))` by hand
  (~15 times). `restore` only clears `deleted_at`, so anything else the delete did stays.
- **Bug (checked):** `removeOrphan` logs `orphans_cleared` when the last Orphan goes; Undo restores the Orphan but
  leaves the log row; deleting again logs again. `trophies/rules.ts:179` counts those rows, so delete → Undo → delete
  inflates the Orphan wrangler trophy. `deleteHabit` also soft-deletes linked routine steps (behind a confirm today,
  so no Undo yet).
- **Deletion test:** `undo.ts` earns its keep as the bar's timer; the remove/restore pairing is the shallow part.
- **Deeper module would hide:** each delete hands back the function that reverses all of it, side rows and activity
  included.
- **Tests:** "delete, Undo, no trace" once per kind of item, without screens.
- **Decided (user, 2026-11-24):**
  - Scope: the 12 plain deletes (tasks on Tasks and Calendar, quests, Vault items ×2, Clear checked, events without
    guests, Offsite connections, journal passkeys), the Orphan delete and the Post It board. Moves, cancels and Clear
    crossed-off stay (their Undo already saves the whole row back). `deleteHabit` stays out (confirmed, no Undo).
  - `brain.remove` / `removeMany` return their undo; only deletes with side effects get a named action with a full
    undo (today just `removeOrphan`). Lint stops screens calling `brain.restore`.
  - Orphan bug: Undo also removes the `orphans_cleared` row the delete wrote.
  - Post Its use the shared Undo bar like everything else: message stays "Post It deleted.", 8 s with pause (not 10 s).
  - Keyboard reach, app-wide (SPEC §2): when the delete was done from the keyboard (the pressed control was
    `:focus-visible`), focus moves to the bar's Undo button; mouse and touch don't move focus. Escape closes the bar
    like ✕. Afterwards focus lands on the page's main heading; the Post It board lands on the note shown (the restored
    one after Undo) and Orphans on the card shown. Applies to Cheers' Share offer too.

## 3. Server calls behind a seam that keeps my copy up to date

- **Files:** `src/events/sharing.ts`, `src/connections/connections.ts`, `src/cheers/cheers.ts`, `src/vault/sharing.ts`
  (four private `call<T>` / `list<T>` wrappers, different error handling); raw `supabase.rpc` in
  `profiles/profiles.ts`, `focus/room.ts`, `trophies/server.ts`, `AccountView.vue:412`; 8 `brain.refresh([...])` sites
  (`CalendarView.vue:285, 295`, `CancelEventDialog.vue:98`, `EventPeople.vue:110`, `InvitedEventDialog.vue:138`,
  `InviteToEventDialog.vue:78`, `BucketSharing.vue:72`, `VaultView.vue:196`); `sync/types.ts` `Remote`;
  `tests/e2e/support/fakeSupabase.ts` `rpcResults`.
- **Problem:** after each call the screen must know which local tables the server changed, and whether to flush first
  (`CalendarView.vue:285` refreshes `events` before `invitePeople`; `InviteToEventDialog.vue:77` doesn't).
  `invitePeople` fires a celebration from a server-call file. `Remote` has only upsert, pull and subscribe, so
  `FakeRemote` can't stand in: Invitee, Guest, Connection and Bucket-sharing flows are e2e-only, with ~30 RPC names
  stubbed by string and specs seeding what the server would have written.
- **Deletion test:** each `call` wrapper is a pass-through; the real complexity sits in N screens.
- **Deeper module would hide:** "do this on the server, then bring my copy up to date": flush first, tables touched,
  offline refusal, error mapping. Two adapters (Supabase, fake that also changes fake tables) justify the seam.
- **Note:** DECISIONS 2026-11-24 left the Remote seam alone; this adds server calls beside it, not changes to it.
- **Tests:** unit-test sharing flows (Invitee added → invite visible locally).

## 4. One module for the signed-in session's lifecycle

- **Files:** `src/App.vue` (sign-in watch, `checkDataReset`, `celebrate.start`, `cheers.start`),
  `src/account/AccountView.vue:354–436` (stop/restart on failed delete, sign-out order), `src/stores/brain.ts`
  (`start`, `stop`, `applyDataReset`), `src/stores/auth.ts`, `src/stores/profile.ts`.
- **Problem:** `brain.start` is wired in App.vue and AccountView; the data-reset check is written three ways; the
  sign-out order (`uploadBeforeSignOut` → `forgetDevice` → `auth.signOut` → route) lives in a screen.
- **Deeper module would hide:** open, reset if wiped, start listeners, sign out, roll back a failed account delete.
- **Tests:** sign-out, a reset on another device and a failed delete, unit-tested instead of e2e only.

## 5. Close brain's raw `save`; tasks, quests and Post Its get their own actions

- **Files:** `src/stores/brain.ts:321–333` (`save`, `remove`, `restore`; ~60-name spread of feature actions);
  `VaultView.vue:179–182, 212`, `QuestsView.vue:168, 183, 193, 237`, `HabitsView.vue:201`,
  `AvailabilityCard.vue:120, 134, 150`.
- **Problem:** generic `save` lets screens hold rules (shared Bucket star/default rules, quest state, availability
  rows built with `auth.user?.id`); habit edits skip `refreshHabit`, so cached streaks can be stale. Wiring order leaks
  (`priorityActions(ctx, habits.toggleHabit, saveTask)`). Tasks, quests, capture, Post Its, people and events have no
  `actions.ts` of their own.
- **Deeper module would hide:** named actions only; rules move out of screens. Pairs with 1 and 2.

## 6. One capture path, Post Its included

- **Files:** `capture/capture.ts:139` (`buildCaptureRecord` throws for `postit`), `CaptureForm.vue:338–393`,
  `brain.convert` (`brain.ts:217`).
- **Problem:** the Post It special case lives in both callers, not in the capture functions. Converting an Orphan
  fires `orphan` but not `task` or `capture` (maybe intended).
- **Likely falls out of 1.**

## Checked and already deep

Sync engine and `useRows`; `habits/actions.ts`; `reminders/actions.ts`; `journal/lockingRemote.ts`;
`celebrate/rules.ts` and `trophies/rules.ts`; `undo.ts` as the bar; `dashboard/stats.ts`. Small note:
`fakeSupabase.ts`'s table list is a hand-kept copy of `SYNC_TABLES`.
