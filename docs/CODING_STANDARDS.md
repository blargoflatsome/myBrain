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
- "Past you" is only for what the user set up or did earlier; something they're doing now is plain "you" (SPEC §2 Voice).
- Messages to other people (guests, invitees) are written plainly from the user, not in the "past you" voice.
- Long-form pages (Privacy, Terms) keep their text in their own page file, written plainly for anyone, since it is a document rather than interface wording.

## 3. Where code goes

| What | Where |
| --- | --- |
| A feature's page, rules and components | `src/<feature>/` (`XView.vue`, `rules.ts`, `components/`) |
| Rules and calculations for a feature | `src/<feature>/rules.ts` (pure functions, no Vue, no database) |
| Data on the device and syncing | `src/sync/` (`live()` for "not deleted", the sync engine, row types in `types.ts`) |
| Reading rows on screens | `src/sync/useRows.ts`: `useRows('tasks')` (or a query function for index lookups), `useRow(table, id)` for one row, `useDeviceQuery` for something worked out from my data (stats, calendar items), and `readRows` / `findRow` for a button press. All are empty while signed out, follow sign-in, and hide deleted rows. Bundles live with their feature (`readDayData`, `useVisibleBuckets`). Pages never read `brain.db` or use `useLiveQuery` themselves **(lint)** |
| Writing data from screens | `src/stores/brain.ts`, which hands out each feature's actions from `src/<feature>/actions.ts` (so screens import one store and every write goes through the sync queue) |
| Signing in and out | `src/stores/session.ts`: `begin()` (once, App.vue) follows sign-in; `signOut`, `deleteAccount`, `deleteMyData` and `checkDataReset` each do the whole job, so screens only show windows and route. Supabase sign-in, my profile row, the sync Remote and push go through `src/session/adapter.ts` (a fake in tests: `src/tests/support/fakeSession.ts`) |
| My profile (name, picture, settings) | `src/stores/profile.ts` (`load()` once per visit, `update(fields)`); screens use it rather than reading `profiles` themselves (the session's Delete-my-data check reads fresh on purpose) |
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
| Reading and writing a row with no rules of its own | `brain.save(table, row)`, `brain.remove(table, id)` / `brain.removeMany(table, ids)`. A delete returns its Undo, passed straight to the page's `undoable.offer`; a delete that does more than remove the row (counts, links) is its own action whose Undo takes all of it back (`removeOrphan`, `deleteTag`) |
| Calling a server function | `src/server/server.ts`: `serverCall` / `serverList` refuse offline before trying and throw a `ServerError` with a reason (`offline`, `limit`, `failed`); screens show `sayWhy(err, { offline, limit, failed })` with `messages.ts` wording, never the server's text. A call that changes my synced tables is a brain action built on `onServer(fn, args, tablesItChanges)` (`src/sync/actions.ts`), which uploads my queued changes first and downloads those tables after, so screens never refresh. Every screen handler that calls the server catches the failure and shows `sayWhy` wording. No `supabase.rpc` anywhere else **(lint)**. Tests use `src/tests/support/fakeServer.ts`: canned answers, seeding `FakeRemote` with the rows the server would now hold |
| Saying I finished something | The action that saves it calls `achieved(...)` (`src/celebrate/bus.ts`) after saving the row and any activity row; screens never do **(lint)**. Firsts and trophy levels are saved by the trophy keeper (`src/trophies/keeper.ts`); `stores/celebrate.ts` only shows bursts and messages. Tests wait with `brain.trophiesIdle()` |
| Undo in place (SPEC §2) | `const undoable = useUndoInPlace()` (`src/composables/useUndoInPlace.ts`) on the page, and `UndoLine.vue` drawn where the row was: `undoable.placed(rows, list)` gives the rows with each line in its row's place, `undoable.ownLines(list)` the lines with no row (draw them under the heading). `undoable.offer(message, undo, { row: { id, in: rowsShown }, list, focusAfter })`; take `rowsShown` before the change's `await`. The line takes focus when it first appears (after a closing window); `focusAfter` says where focus lands after Undo when it isn't the row back in its place |
| Security helpers | `src/security/`, `src/notifications/pushEndpoints.ts` |
| Search listing and link previews | `src/seo/` (tags, sitemap, canonical, Page not found); `build/seo.ts` adds them at build; a new route also needs a line in `netlify.toml` |

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

### Forms and page parts are shared, never copied (2026-11-12, user)
The same thing must look and work the same everywhere, so it is built once and reused. Before writing any field,
choice, button or row, search `src/components/` and the feature's `components/` folder and use what's there; if
it's missing, make it shared first, then use it in every place.
- **One form per item type.** An item type that can be made or edited in more than one place has one
  `<Type>Fields.vue` (`TaskFields`, `HabitFields`, `QuestFields`, `VaultItemFields`; Post Its share `PostItColors`).
  Capture, the editor and Orphans only hold the frame around it: the window, Capture's text box and type chips, the
  Save button. Extras only one place has (tags in the editors) go after the shared fields. **(lint)** these files
  can't draw an `input`, `select`, `textarea` or `fieldset` of their own (`eslint.config.ts` lists them; add any
  new one there).
- **One control per kind of choice.** A short fixed choice (up to 10 options) is `ChoiceChips`; a longer or
  growing list is a `select` (buckets switch at 10, `BucketChoice`). Titles are `TitleField`, dates `DateInput`,
  times `TimeInput`, notes `NotesEditor`, weekdays `WeekdayPicker`, how often `HowOften`, priority
  `PriorityPicker`. **(lint)** only `ChoiceChips` (and the toggles listed in `eslint.config.ts`) may use `chip`.
- **"+ New" lives in the page heading.** `NewButton` goes in `PageHeading`'s slot on the page (`*View.vue`), also
  for a tab inside a page (the Tasks page's Priority tab calls the tab's `startNew`). **(lint)** components can't
  use `NewButton`.
- **Same labels everywhere.** A shared field reads its wording from one place in `messages.ts`; don't pass a
  different label per screen.

## 7. Accessibility (WCAG 2.2 AA)

- Every control has a label; icon-only buttons have an `aria-label`.
- Tap targets at least 24 px, 44 px where practical (`min-h-11 min-w-11`).
- Nothing by colour alone; contrast checked in both themes.
- Anything done by dragging or swiping also works with a tap and with the keyboard.
- Windows use `<dialog>` with `showModal()` (focus is trapped and returned by `src/a11y/focus.ts`).
- Hidden-until-hover controls also appear on keyboard focus.
- Focus is never hidden behind the sticky header or bottom bar (WCAG 2.4.11): scrolling areas get `scroll-margin` /
  `scroll-padding` the height of the bars (2026-11-15).
- When a save is refused, the field with the problem gets `aria-invalid="true"` and its message
  (`aria-describedby`), and focus moves to the first such field (2026-11-15).

## 8. Security

- Everything people type is untrusted. Show it as text (`{{ }}`); `v-html` is only allowed with `cleanHtml()`.
- Links people type go through `linkTarget()`; never bind a typed value straight to `href`.
- New text columns get a size limit in the database and a matching `maxlength` on the input.
- No SQL built from typed text; server functions use `security definer set search_path = ''` and check permissions,
  sizes and rate limits.
- Full rules: SPEC §8.

## 9. Data and the database

- Ids are made on the device so offline saves never duplicate.
- **Deleted rows are hidden unless asked for (2026-11-24).** Rows are soft-deleted, so every read hides them by
  default: `useRows`, `readTables` and `getRow` (one row by id; a deleted one reads as not found). A reader that needs
  deleted rows says so with `{ includeDeleted: true }`: trophy and First history (they count deleted tasks, cancelled
  events and so on) and day stats' quest titles. Actions that look at a row's deleted copy before writing over it
  (keeping its id, not celebrating twice, a cleared alert staying cleared) and the sync engine read the table directly.
  Rule functions keep their own `deleted_at` checks.
- **Changing a server function:** start from its current version, `npm run db:fn <name>` (no name lists them all).
  A migration that changes which synced tables a function writes also updates the `changes` list of its brain action
  (`onServer(fn, args, changes)` in `src/<feature>/actions.ts`), or my copy stops catching up after the call.
- Every limit a server function keeps raises `errcode = 'P0429'` (SPEC §7) **(lint: `scripts/check-limit-codes.mjs`)**.
- Schema changes are migrations in `supabase/migrations/`, applied to dev, checked with `npm run test:db`, then prod
  before merging. Constraints added to existing tables use `NOT VALID` so old rows can't block the change.
- **Database safety (2026-11-15, from Supabase's agent skills; details in the `supabase-postgres-best-practices`
  skill):**
  - Policies name their role (`to authenticated`) and still check ownership: `using ((select auth.uid()) = user_id)`.
    `(select auth.uid())` runs once per query, not once per row. Never `auth.role()`.
  - UPDATE and `for all` policies need `with check` as well as `using`, or someone could move a row to another user.
    An UPDATE also needs a SELECT policy, or it silently changes 0 rows.
  - Every `security definer` function: `set search_path = ''`, checks `auth.uid()` itself, and is followed by
    `revoke execute on function … from public, anon;` plus a `grant execute … to authenticated` (Postgres lets
    everyone run new functions by default). The one exception is the guest-link functions (`guest_*`), which `anon`
    may run because they check the link's token instead. Never add `security definer` just to get past a permission
    error.
  - Views skip RLS unless made `with (security_invoker = true)`; prefer a server function.
  - Never decide permissions from `user_metadata` (people can edit their own); use our tables or `app_metadata`.
  - Index the columns that policies filter on and every foreign key column (Postgres doesn't index them itself).

## 10. Performance

- Pages load per route (`() => import(...)`). Large libraries used by only some screens load when first shown
  (`defineAsyncComponent`), as the formatting editor does.
- Read from the device's copy of the data (`useRows`), never wait on the network to show a screen.
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
- The `writing-tests` skill is the rulebook; `CLAUDE.md` Tests has the long-text, clock and quick/full review rules.
- Use real input where it matters (a real touch swipe, real typing), not faked events.
- Wait for data to load before measuring layout.
- CI runs the full review on every pull request too.

## 12. Git

- One branch and pull request per change; merge to `main` only when asked (each merge is a production deploy).
- Commit messages: a short summary line, then what changed and why.
