# My Brain — Claude Code rules

**Start every session by reading this file, [PROGRESS.md](PROGRESS.md), [docs/CODING_STANDARDS.md](docs/CODING_STANDARDS.md) (how code is written), and sections 1–3 of [docs/SPEC.md](docs/SPEC.md) (the source of truth). Then read only the spec sections the task touches (`grep -n '^#' docs/SPEC.md` lists them). Don't read the whole spec, [docs/DECISIONS.md](docs/DECISIONS.md) or [docs/PROGRESS_ARCHIVE.md](docs/PROGRESS_ARCHIVE.md) unless the task needs them; search them instead.**

## Key rules (full list: SPEC "How to work")
- Spec first: propose spec changes and get the user's OK before building something new or different. Update `docs/SPEC.md` in the same change as the code.
- Don't guess: if the spec is silent or unclear, ask, then write the answer into the spec (and log it at the end of `docs/DECISIONS.md`).
- Every feature gets Vitest and/or Playwright tests named after the spec rule they prove. Anything that shows text people type is tested with long text too: a long sentence, a paragraph, and an unbroken string like a pasted link (shared samples in `e2e/a11y.spec.ts`, checked at 320 px wide). While coding, run the quick checks (`npm run test:quick`) after each change; run the full three-device review (`npm run test:all`, plus `npm run test:db` by the user when migrations changed) **only when the user says to merge**, and merge only if it passes. No screenshots unless the user asks. Mock the clock for anything time-dependent.
- Update `PROGRESS.md` at the end of each session; keep it short by moving older merged sections to `docs/PROGRESS_ARCHIVE.md`.
- The public **Features** and **Docs** pages are removed until the app is finished (user, 2026-11-10, to save tokens); they will be written fresh then. Don't maintain them meanwhile.
- Secrets live only in `.env.local` (gitignored) and Netlify env vars. Only the Supabase anon key may reach the browser. Ask for each credential when first needed.
- Every table: `id, user_id, created_at, updated_at (server-set), deleted_at`, with RLS.
- All user-facing wording in the "past you" voice, kept in one messages file.
- Accessibility: everything meets WCAG 2.2 Level AA (SPEC §2). Keyboard and screen reader use, visible focus, contrast in light and dark, targets ≥24 px (44 px where practical), labels on every control. New pages get an axe check in `e2e/a11y.spec.ts`; review by hand what axe can't check.
- Work on a branch per build step; merge to main once per step (Netlify free plan ≈ 20 production deploys/month).
- Confirm before anything that removes data or affects other users.

## Commands
- `npm run dev` — dev server
- `npm run build` — type-check and build to `dist/`
- `npm run lint` / `npm run typecheck`
- `npm test` — Vitest (unit/integration, `src/**/*.test.ts`)
- `npm run test:e2e` — Playwright (`e2e/`, desktop + Pixel 7; builds and serves on :4173)
- `npm run test:quick` — quick checks while coding: types, Vitest, and the browser tests on desktop only (~3 min)
- `npm run test:e2e:quick` — just the desktop browser tests; add a file name to run one (`npm run test:e2e:quick -- quests`)
- `npm run test:all` — the full pre-merge review, everything CI runs: lint, types, Vitest, all browser tests on desktop, and the phone-sensitive ones (listed files + `@phone` tag) on Android and iPhone. Tag new tests that depend on screen size, touch or the browser engine with `{ tag: '@phone' }`.
- `npm run test:db` — SQL rule checks (RLS) against dev; prints ✔/✘ per file. Only the user runs it (it confirms with --yes); ask first.
- `npm run dev:accounts` — create or reset the dev-only test accounts (Dev Alice, Bob, Carol); password saved to `.env.local`, never printed.
- `npm run test:flows` — walk the connection and sharing flows against the real dev backend as the test accounts; prints ✔/✘ per step.
- `npx supabase db push --remote` — apply new migrations to the linked dev project (no Docker, so no local stack)
