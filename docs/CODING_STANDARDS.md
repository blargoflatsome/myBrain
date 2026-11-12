# My Brain coding standards

How code in this project is written. It's a working document: edit anything here, and the code follows. Rules that
a tool enforces are marked **(lint)**; the rest are checked in review. `docs/SPEC.md` says *what* the app does; this
file says *how* the code is written.

---

## 1. Vue files

- **Template first, then script, then style (lint).** Reading the markup first shows what the component is before
  how it works. ESLint (`vue/block-order`) fails the build otherwise.
- Always `<script setup lang="ts">`.
- The script opens with one comment saying what the component is for, with the spec section it implements
  (for example `// SPEC §5 Journal: ...`).
- Keep components thin: rules and calculations live in plain TypeScript modules (section 3) so they can be unit
  tested without a browser.
- Component files are `PascalCase.vue`. **Everything for a feature lives in its folder** (`src/<feature>/`): its page
  (`TasksView.vue`, one per route), its rules, and its own components in `src/<feature>/components/`. A component another
  feature also uses stays with the feature it belongs to (Calendar imports `src/tasks/components/TaskEditor.vue`).
  `src/components/` holds only app-wide pieces: the app shell (header, tabs, undo bar) and building blocks used everywhere
  (icons, date and time fields, notes editor, fold-outs, confirm window).

## 2. Wording

- Every word the app shows lives in `src/messages.ts`, in the "past you" voice (SPEC §2). No user-facing strings in
  components or modules.
- Messages that need values are small functions: `deleteItem: (title: string) => \`Delete ${title}\``.
- Messages to other people (guests, invitees) are written plainly from the user, not in the "past you" voice.
- Long-form pages (Privacy, Terms) keep their text in their own page file, written plainly for anyone, since it is a document rather than interface wording.
- **Features and Docs:** dropped (2026-11-11); there are none.

## 3. Where code goes

| What | Where |
| --- | --- |
| A feature's page, rules and components | `src/<feature>/` (`XView.vue`, `rules.ts`, `components/`) |
| Rules and calculations for a feature | `src/<feature>/rules.ts` (pure functions, no Vue, no database) |
| Data on the device and syncing | `src/sync/` (`live()` for "not deleted", the sync engine, row types in `types.ts`) |
| Reading and writing data from screens | `src/stores/brain.ts`, which hands out each feature's actions from `src/<feature>/actions.ts` (so screens import one store and every write goes through the sync queue) |
| My profile (name, picture, settings) | `src/stores/profile.ts` (`load()` once per visit, `update(fields)`); screens use it rather than reading `profiles` themselves (the Delete-my-data check in `App.vue` reads fresh on purpose) |
| Ids that must match on every device (a day's log, a fixed alert) | `src/sync/ids.ts` (`logIdFor`, `fixedId`) |
| A clock that ticks (timers running out) | `src/composables/useNow.ts` (`useNow(everyMs)`), next to `useToday` |
| Reusable screen behaviour | `src/composables/useX.ts` (a composable only one feature uses lives in that feature's folder) |
| Shared look of controls | `src/ui/styles.ts` (fields, field labels, chips, main and secondary buttons, Delete links, checkboxes, windows, cards) |
| Icons | `src/components/AppIcon.vue` with the set in `src/ui/icons.ts` (no hand-drawn `<svg>` icons) |
| An editor window (heading, fields, Save, Close, Delete, ✕) | `src/components/EditorDialog.vue` |
| Weekday chips | `src/components/WeekdayPicker.vue` |
| Showing dates | `src/ui/dates.ts` (`dayLabel`, `timeLabel`, `dayTimeLabel`, `momentLabel`, `shortDay`, `shortDayWithYear`, `dateWithYear`) |
| Day maths ("today", adding days, the day a moment fell on) | `src/tasks/days.ts` (`todayIn`, `addDays`, `dayOf`) |
| Remembered on this device only | `src/ui/storage.ts` (`readKey`, `writeKey`, `readJson`, `writeJson`; never fails) |
| "Are you sure?" before removing data | `src/components/ConfirmDialog.vue`; type DELETE first: `src/components/TypeToConfirmDialog.vue` |
| Formatted text | `NotesEditor.vue` for notes fields, `RichTextEditor.vue` for the journal and Post Its; `cleanHtml()` to show |
| Dates typed by people | `DateInput.vue` (type or pick on a computer, the device picker on a phone) |
| Times typed by people | `TimeInput.vue` (type or pick on a computer, the device picker on a phone) |
| Reading and writing a row with no rules of its own | `brain.save(table, row)`, `brain.remove(table, id)`, `brain.restore(table, id)` |
| Security helpers | `src/security/`, `src/notifications/pushEndpoints.ts` |

Before writing something new, check these first. If the same code is needed in a second place, move it here rather
than copying it.

## 4. TypeScript

- Strict mode; no `any`. Row shapes come from `src/sync/types.ts`.
- Prefer small named functions over long inline expressions in templates.
- Dates are `YYYY-MM-DD` strings and times `HH:MM` strings in the user's own time zone; use the helpers in
  `src/tasks/days.ts` for "today", adding days and so on. Never compare `Date` objects for calendar days.
- Style: 2 spaces, single quotes, no semicolons, trailing commas (the existing code is the reference).

## 5. Comments

- **Say why, not what.** A comment explains a reason, a rule from the spec, or a trap (for example "Escape closes only
  the list, not the window it sits in"). If the code already says it, don't comment.
- Link rules to the spec: `(SPEC §5 Habits)`, accessibility to WCAG: `(WCAG 2.5.7)`.
- Exported functions get a one-line `/** ... */` saying what they return.
- No comments that repeat a heading (`<!-- Habits -->` above a "Habits" heading), no notes about who wrote or
  approved something (the spec's decision log records that), no commented-out code.

## 6. Styling

- Tailwind classes, with colours from the theme tokens in `src/style.css` (`bg-surface`, `text-muted`, `text-danger`,
  ...). No hard-coded colours except the Post It paper colours.
- Use the shared class lists in `src/ui/styles.ts` for fields, chips, answers, buttons, windows and cards.
- Every screen works in light and dark, at 320 px wide with no sideways scrolling.

## 7. Accessibility (WCAG 2.2 AA)

- Every control has a label; icon-only buttons have an `aria-label`.
- Tap targets at least 24 px, 44 px where practical (`min-h-11 min-w-11`).
- Nothing by colour alone; contrast checked in both themes.
- Anything done by dragging or swiping also works with a tap and with the keyboard.
- Windows use `<dialog>` with `showModal()` (focus is trapped and returned by `src/a11y/focus.ts`).
- Hidden-until-hover controls also appear on keyboard focus.
- New pages and windows get an axe check in `src/tests/e2e/accessibility/a11y.spec.ts`.

## 8. Security

- Everything people type is untrusted. Show it as text (`{{ }}`); `v-html` is only allowed with `cleanHtml()`.
- Links people type go through `linkTarget()`; never bind a typed value straight to `href`.
- New text columns get a size limit in the database and a matching `maxlength` on the input.
- No SQL built from typed text; server functions use `security definer set search_path = ''` and check permissions,
  sizes and rate limits.
- Secrets only in `.env.local` and Netlify/Supabase settings; only the Supabase anon key reaches the browser.
- Full rules: SPEC §8.

## 9. Data and the database

- Every table: `id, user_id, created_at, updated_at` (set by the server), `deleted_at` (soft delete), with RLS.
- Ids are made on the device so offline saves never duplicate.
- Schema changes are migrations in `supabase/migrations/`, applied to dev, checked with `npm run test:db`, then prod
  before merging. Constraints added to existing tables use `NOT VALID` so old rows can't block the change.

## 10. Performance

- Pages load per route (`() => import(...)`). Large libraries used by only some screens load when first shown
  (`defineAsyncComponent`), as the formatting editor does.
- Read from the device's copy of the data (`useLiveQuery`), never wait on the network to show a screen.
- Windows build their contents only while open (`EditorDialog.vue`, `v-if` on the form), so a closed editor never
  loads the formatting editor. Something always on screen (the priority reminder, search) reads only what it needs:
  today's rows by index, or nothing until it opens.
- The date library behind typed dates loads only where a date can be typed (`src/time/typedDate.ts`); phones use
  their own picker and never load it.

## 11. Tests

- Every rule gets a test named after the spec rule it proves. All tests live in `src/tests/`, by kind, then by what
  they test: `unit/<feature>/` (Vitest, logic), `integration/` (Vitest against the dev database), `e2e/<feature>/`
  (Playwright, screens; helpers in `e2e/support/`), `db/` (SQL checks for database rules). Test-only helpers go in
  `src/tests/support/` (or `e2e/support/`), never in app code. A test file covers one feature; split it when it grows to
  cover several.
- **The `writing-tests` skill** (`.claude/skills/writing-tests/SKILL.md`) is the rulebook: every test must name the bug it
  catches, wording comes from `messages.ts` (never typed out), styling is only checked when it's the rule, and logic is
  tested in unit tests rather than the browser.
- Use real input where it matters (a real touch swipe, real typing), not faked events.
- Test typed text long: a long sentence, a paragraph and an unbroken link (samples in `src/tests/e2e/accessibility/a11y.spec.ts`).
- Mock the clock for anything time-dependent; wait for data to load before measuring layout.
- **Two levels of testing.** While coding, run the quick checks after each change: `npm run test:quick` (types, Vitest, desktop browser tests), or just the files you touched (`npm run test:e2e:quick -- quests`). When the user says to merge, run the full review once, and merge only if it passes: `npm run test:all` (lint, types, Vitest, desktop, Android and iPhone), and `npm run test:db` when there are new migrations. CI runs the full review on every pull request too.

## 12. Git

- One branch and pull request per change; merge to `main` only when asked (each merge is a production deploy).
- Commit messages: a short summary line, then what changed and why.
