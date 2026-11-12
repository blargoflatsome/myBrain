# UI review tasks (2026-11-11)

The UI review (flow, consistency, forms, ADHD fit, new features), written as proposed spec changes. Nothing here is
built or in `docs/SPEC.md` yet. **Rec** = my recommendation; items marked **Ask** need the user's choice first.

**Before starting:** read `CLAUDE.md` and follow it (spec first, `writing-tests` skill, `npm run test:quick` after each
change). Once agreed, each change goes into `docs/SPEC.md` and `docs/DECISIONS.md` in the same change as the code.

Suggested branches (one merge each): **A** Flow (F1–F3), **B** Consistency + forms (C1–C8, M1–M2), **C** ADHD fit (H1–H3),
**D** New features (N1–N3; N2 and N3 need migrations). Branch A to D are separate, so they can run in parallel
sessions if wanted (B touches the most files; run it alone or last).

## A. Flow (built 2026-11-12, branch `ui-flow`)

- **F1 Capture: type box first.** SPEC §2.1 and §5 Quick capture ("Choose the type first") change to: Capture opens
  with the text box focused; the type chips (Task, Vault, Quest, Habit, Post It, Decide later) sit under it, with
  **Decide later chosen**. Save with no other chip saves to Orphans. Choosing a chip shows that type's extra fields
  below the box and keeps what I typed (first line = title, rest = notes, as with shared text). The mic fills the box.
- **F2 Orphans one at a time.** SPEC §5 Quick capture / Orphans: the page shows the oldest orphan as a card with the
  five file buttons, plus "1 of 10" and Skip (moves it to the back). Like the routine run screen. Filing or deleting
  shows the next; the all-sorted state is unchanged.
- **F3 Carried-over task: easy options.** SPEC §5 Tasks: a task that carried over twice shows **Tomorrow** and
  **Undated** (one tap, with Undo) next to Edit and Cancel task. Tomorrow resets its carry-over count (new due date).

## B. Consistency (built 2026-11-12, branch `ui-consistency`)

- **C1 One way to add.** (User chose, 2026-11-11.) Every list page has the same "+ New …" button at the top right
  of the heading (soft accent outline, not solid); Tasks and Vault keep their inline quick-add box as well, because it
  is faster. Quests get a "+ New quest" too (SPEC §5 Random Quest drops "added through Capture, not on the Quests page").
- **C2 Row actions.** (User chose, 2026-11-11.) On every editable row (tasks, priority tasks, habits, routines,
  journal, quests, Vault items) tapping the title opens the editor, and the row ends in a **trash can** that deletes
  it (with Undo, or a confirmation where SPEC §2 asks for one: habits and routines with history). The separate Edit
  buttons go. SPEC §2 Calm by design "List rows end in the same small actions" and §5 Tasks "Edit button at its end"
  change; Cancel task stays on tasks that carried over twice.
- **C3 Same choice, same look.** Task editor Priority uses the Capture chips, in Capture's order (Low, Medium, High);
  Tasks tabs and the Calendar view switch get the check mark (SPEC §2 already asks; this is a fix).
- **C4 Check circles.** One shared check control: 44 px target (circle drawn 32 px), the drawn check from tasks used
  everywhere instead of a text ✓. SPEC §2 gets one line.
- **C5 Shared styles.** Replace hand-written bordered buttons with the `ui/styles.ts` ones; the priority task editor
  uses `EditorDialog` and `WeekdayPicker`. No spec change (CODING_STANDARDS already says reuse).
- **C6 Red only for errors.** Missed habit ring uses the muted style; "Most missed" bars become neutral; Cancel event
  becomes orange (`--warning`, like Delete my data, since it affects others). SPEC §2 Colours gets the Cancel event
  case.
- **C7 Day navigation.** Tasks uses Calendar's bordered ‹ › and a visible **Today** button (shown when not on today);
  "tap the heading for today" goes. SPEC §5 Tasks gets one line.
- **C8 Side menu icons.** Side menu items get the same icons as the phone tabs and More panel. SPEC §3 Navigation.

## Forms

- **M1 Account saves.** One-field settings (Celebrations, snooze, event news method, streak visibility) save as soon
  as they change, with a quiet "Saved" note; groups with several fields keep one Save. Account Settings stops nesting
  groups inside a group: its groups become top-level groups. SPEC §5 Account page layout changes.
- **M2 Capture button.** Capture's button matches the editors: normal size and shape, saying what it saves ("Save
  task", "Save to Orphans", …).

## C. ADHD fit

- **H1 Missed habits aren't failure.** A missed day shows the muted style (no red ✕, no disabled look); each habit
  shows "kept 26 of the last 30 days" beside the streak (scheduled days only). Dashboard "Most missed" becomes
  **Needs some love** (same top 3, neutral bars). SPEC §5 Habits and Dashboard change.
- **H2 One line at a time on Tasks.** Above the list show only one muted line: the empty/done line if it applies,
  else the past-you line, else the intro. SPEC §5 Tasks.
- **H3 Pick 3.** (User chose: automatic, 2026-11-11.) A **Pick 3** toggle on today's list shows the first 3 open
  tasks in the usual order (High, Medium, Low, then oldest) and folds the rest under "Show the rest (7)". Remembered on
  this device. No migration.

## D. New features

- **N1 Quest Picker includes tasks.** (User chose: always, 2026-11-11.) SPEC §5 Random Quest: open tasks due today
  (including carried-over) and Undated tasks are always in the draw alongside quests.
  Tasks have no energy or time, so they match any filter. A picked task shows Done (crosses it off), Do it today (for
  Undated) and Re-roll. Task picks don't change quest stats.
- **N2 Pause streaks.** SPEC §5 Habits and Account page: **Pause all streaks** on the Account page stays on until I
  unpause. Paused days count like unscheduled days: they neither extend nor break a streak, reminders aren't sent, and
  I can still check habits off (it counts as kept). Stored as pause periods (`habit_pauses`: start date, end date or
  empty while paused) so streaks can be recalculated; the server reminder job skips paused days. Pause all
  only, no per-habit pause (user, 2026-11-11).
- **N3 Appearance.** SPEC §3 Visual style: Account setting **Appearance: System (default), Light, Dark**, saved to my
  profile (`profiles.appearance`) and remembered on the device so it applies before sign-in finishes.
