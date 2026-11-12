---
name: writing-tests
description: Use before adding, changing or reviewing any test in My Brain (Vitest unit/integration, Playwright e2e, SQL rule checks), including adding one assertion to an existing test. Keeps tests few, meaningful and hard to break by unrelated changes.
---

# Writing tests in My Brain

Tests prove the spec's rules (docs/SPEC.md) and catch real regressions. They should survive wording changes, spacing
tweaks and refactors that don't change behaviour. A test that breaks when nothing a person would notice changed is a
bad test.

## The gate: answer all three before writing a test

1. **What would it catch?** Name the realistic bug (the rule, the code path, the input) that no existing test catches.
   "More coverage" or "good practice" is not an answer. If you can't name it, don't write the test.
2. **Where does it go?** Find the nearest existing test. A variation of it becomes another case (`test.each` /
   `it.each`), not a copy. A new test needs a reason: different setup, a different rule, or nothing covers it yet.
3. **Does it go red?** Break the line it guards (flip a condition, return early, drop a clause), check the test fails
   for the reason in question 1, then put the line back. A test that stays green guards nothing.

## Where tests live

All tests are in `src/tests/`, by kind, then by what they test:

- `unit/<feature>/` — Vitest, rules and stores (most tests belong here)
- `integration/` — Vitest against the dev database
- `e2e/<feature>/` — Playwright, things only a real browser shows; helpers in `e2e/support/`
- `db/` — SQL checks for row-level security and database rules (`npm run test:db`, the user runs it)
- `support/` — test-only helpers (like `fakeRemote.ts`), never in app code

Name every test after the spec rule it proves: `describe('SPEC §5 Trophies: streaks', ...)`.

## Test as low as you can

Cheapest first: a pure function in `src/<feature>/rules.ts` → a store (`stores/brain.ts`, `stores/celebrate.ts`)
with `fake-indexeddb` and `FakeRemote` → a Playwright test. Many unit tests, few browser tests.

- If logic is hard to reach from a unit test, move it into a pure function and test that; keep one browser test that
  the screen is wired to it. Put case matrices (every input, every edge) on the pure function, never in Playwright.
- A Playwright test is for what only the browser shows: a page wired up end to end, keyboard and focus, a window
  opening, layout at 320 px, touch, offline, accessibility.

## Assert outcomes, not wording or styling

- **Wording comes from `src/messages.ts`**, never typed out. Import `messages` (Vitest: `@/messages`; Playwright:
  a relative import) and compare against it, so changing a message never breaks a test. Only a test whose rule *is* a
  piece of wording may type it out (for example the user's own fixed phrases), and it says so in a comment.
- **Find elements by role, label or `data-testid`**, preferring `data-testid` when the visible text is wording.
- **Don't assert styling** (pixel gaps, colours, class names, exact element order) unless the spec rule is about it
  (contrast, 44 px targets, no sideways scroll, "X comes right after Y"). Spacing the user tunes by hand must never be
  pinned by a test.
- **Don't assert how the code does it**: no checking which internal function ran, call counts on spies, or private
  state. Check what a person sees or what was saved (`server.written(...)` in e2e, rows in Dexie in unit tests).
- Prefer `toMatchObject` on the saved row over one field at a time, so a failure shows the whole row.

## Don't write

- Tests of the framework or libraries (Vue rendering a prop, Dexie storing a row, Tailwind making a class).
- Change detectors: tests that pin structure, order or wording that isn't the rule.
- Near-duplicates: many tests differing by one input — make one `each` table.
- Coverage-chasing tests for an untested line. Delete dead code instead.
- A second test of a rule another test already proves, at a higher (more expensive) level.

## Make them deterministic

- **Mock the clock** for anything time-dependent (`page.clock.install` in Playwright, `vi.useFakeTimers` in Vitest,
  always restored in `finally`/`afterEach`). Fixtures use dates relative to the pinned `NOW`, never "today".
- **No fixed waits** (`waitForTimeout`, `setTimeout` sleeps). Wait for the result: `expect(...).toBeVisible()`,
  `expect.poll(...)`, `vi.waitFor(...)`. Advance a mocked clock by exactly the time the rule needs.
- No real network: browser tests use `FakeSupabase` (`e2e/support/fakeSupabase.ts`), unit tests `FakeRemote`.
- Every test sets up the data it reads and passes alone and in any order.
- Never commit `test.only`. A `test.skip` gives a one-line reason (for example "phones use their own date picker").

## Project rules that always apply

- **Long typed text:** anything that shows text a person types is tested with a long sentence, a paragraph and an
  unbroken pasted link, at 320 px wide with no sideways scroll (shared samples in `e2e/accessibility/a11y.spec.ts`).
  One such check per screen is enough.
- **Accessibility:** a new page or window gets an axe scan in `e2e/accessibility/a11y.spec.ts`.
- **Phones:** Android and iPhone run only device-sensitive tests: whole files in `PHONE_FILES`
  (`playwright.config.ts`) or tests tagged `{ tag: '@phone' }`. Tag only tests that depend on screen size, touch or
  the browser engine.
- **Two levels:** `npm run test:quick` while coding (or `npm run test:e2e:quick -- <file>`); the full
  `npm run test:all` only when the user says to merge.

## When reviewing existing tests

For each test, ask the gate questions. Then fix in this order: hard-coded wording → messages; styling and
incidental-order checks → removed unless they're the rule; duplicates → merged into an `each` table or deleted;
case matrices in Playwright → moved to a unit test; fixed waits → waits on results. Deleting a test is a valid fix when
you can't name what it catches.
