# Architecture review tasks (review 3, 2026-11-24)

The third `/improve-codebase-architecture` pass. Review 1 gave `useRows`; review 2's candidates (finish module, deletes
with Undo, server seam, session owner) are merged and recorded in `docs/DECISIONS.md`; its last one (close brain's raw
`save`) is candidate 3 here. The review 2 list is in git history (this file before 2026-11-24's review 3).

Nothing here is decided or built yet. Step through them one at a time: grill the user on one, record the choices in
`docs/DECISIONS.md` (and `docs/SPEC.md` if behaviour changes), build it on its own branch, then mark it here. A
candidate the user turns down gets its reason here and in DECISIONS so later reviews don't re-suggest it.

Words: **module** (anything with an interface and an implementation), **interface** (everything a caller must know),
**deep** (much behaviour behind a small interface), **shallow**, **seam**, **adapter**, **locality**, **leverage**.

| # | Candidate | Strength | Status |
|---|---|---|---|
| 1 | Capture files through each kind's own add action | Strong, real bug | Built (branch `capture-through-adds`) |
| 2 | "Do it" and "Done" complete, never toggle | Strong, suspected bug | Built (branch `complete-not-toggle`) |
| 3 | Close brain's raw `save` (review 2, candidate 5) | Worth exploring | Built (branch `close-raw-save`) |
| 4 | Device settings behind the server seam: push and profile saves | Strong (suspected bug heals itself) | Built (branch `device-settings`) |
| 5 | One module for calendar days and clock times | Worth exploring | To do |
| 6 | One way to show a list that comes from the server | Worth exploring | Built (branch `server-lists`) |
| 7 | One module for "open this item" links | Worth exploring, suspected bug | To do |
| 8 | Focus and Breathe finish themselves | Worth exploring | To do |
| 9 | Typed date and time fields share one picker module | Speculative | To do |

## 1. Capture files through each kind's own add action
- **Files:** `capture/capture.ts:92–142` (`buildCaptureRecord`), `:185` (`buildConversion`); `stores/brain.ts`
  (`capture`, `convert`, `addTask`); `vault/actions.ts:26–34`; `QuestsView.vue:231` (`startNew` literal);
  `HabitEditor.vue:96–109`; `CaptureForm.vue:333, 366–372, 396`; `TaskEditor.vue:60–62`; `celebrate/rules.ts:67`.
- **Problem:** capture builds its own rows beside each kind's add. A captured Vault item has no `created_at` or
  `checked`, so offline it sorts wrongly until the server answers (`vault/rules.ts:19`). Filing an Orphan into the Vault
  never earns the Vault First (SPEC §5: "save to the Vault"). Habit rules differ between capture and the editor; the
  timer check and the task reminder-in-past check are written two or three times.
- **Deeper module would hide:** each kind's defaults, ordering fields, checks and celebration.

## 2. "Do it" and "Done" complete, never toggle
- **Files:** `UpNextCard.vue:17, 140–150`; `reminders/actions.ts:16–25` (`completePriority`); `habits/actions.ts:89–92`
  (`completeHabit`, unused by these).
- **Problem:** Up next's habit and task buttons and the priority habit slide toggle, so a second tap or a stale
  suggestion undoes the completion. Tasks are guarded in the slide, not in Up next.

## 3. Close brain's raw `save`
- **Files:** `stores/brain.ts:216` (`priorityActions(ctx, habits.toggleHabit, saveTask)`); 13 raw saves
  (`QuestsView.vue:177, 192, 202, 250`, `VaultView.vue:184–187, 216`, `AvailabilityCard.vue:120, 134, 150`,
  `MyPeople.vue:104`, `HabitsView.vue:201`) and 10 raw removes; tags saved by editors (`HabitEditor.vue:98` and
  `RoutineEditor.vue:215` with `void`, `TaskEditor.vue:66` with `await`).
- **Problem:** screens hold rules (Vault star/default, quest state, availability rows with `auth.user?.id`); habit edits
  skip `refreshHabit` (stale streaks); `AvailabilityCard.vue:14, 56` drops the Undo; people de-duplicated two ways
  (`MyPeople.vue:101–103` vs `peopleToSave`); "empty Post It" checked three times.

## 4. Device settings behind the server seam
- **Files:** `NotificationSettings.vue:68, 109–139, 152`; `stores/profile.ts:51, 86–96`; `AccountView.vue:297, 306,
  308, 329, 337, 338`; `stores/session.ts:56`.
- **Problem:** turning push off deletes the server row unchecked and unsubscribes anyway (offline leaves a stale
  endpoint); `profile.update` bypasses `server.ts` and returns a boolean, so every failure reads "offline"; appearance
  and celebrations are applied in two places each.

## 5. One module for calendar days and clock times
- **Files:** `tasks/days.ts`; `habits/rules.ts:18, 65` (imported by 7 other folders); `trophies/rules.ts:61–66, 196,
  241, 244`; `UpNextCard.vue:93–97`; `FindATime.vue:72`; `availability.ts:74, 187`; `ui/dates.ts:32–43`.
- **Problem:** clock-time-in-a-zone written three ways, weekday-of-date by hand in five places, `ui/dates.ts` uses the
  device clock. Monthly repeats differ on purpose (habits: last day of month; events: skip), keep both.

## 6. One way to show a list that comes from the server
- **Files:** `CheersView.vue`, `cheers/cheers.ts`; `ConnectionsPanel.vue:157–165`; `MyPeople.vue` (`loadAccounts`);
  `EventPeople.vue:95`.
- **Problem:** Connections and people lists load only on mount (opened offline, stay empty; failed looks empty);
  Cheers' reaction switch is two server calls in the screen and rechecks trophies on every switch (suspected over-count).

## 7. One module for "open this item" links
- **Files:** built in `SearchDialog.vue:160–166`, `UpNextCard.vue:156`, `DashboardView.vue:84`, 16 in SQL; read in 8
  views' watch blocks; `router/index.ts:21` (route `home` is Tasks).
- **Problem:** `/calendar?event=` with no date opens the event but stays on this month (suspected).

## 8. Focus and Breathe finish themselves
- **Files:** `stores/focus.ts:62–79`; `FocusTimer.vue:96–126`; `BreatheWindow.vue:90–94`; `App.vue:84–85`.
- **Problem:** screens read short-lived store values right after `tick`, then call the finish.

## 9. Typed date and time fields share one picker module
- **Files:** `DateInput.vue`, `TimeInput.vue`, `tests/unit/time/date-input.test.ts`.
- **Problem:** repeated steps; `TimeInput` clears to `''` even when required; only the date field is tested.

## Checked and already deep
`a11y/focus.ts`, `journal/lockActions.ts`, `events/availability.ts`, `voice/parse.ts`, `search/search.ts`,
`tags/actions.ts`, `routines/actions.ts`, `dashboard/upNext.ts`, `sync/types.ts`, `messages.ts` (found by key). Small
note: `fakeSupabase.ts` hand-keeps its table list and an unknown table quietly reads `[]`.
