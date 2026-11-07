# My Brain — Claude Code rules

**Start every session by reading this file, [docs/SPEC.md](docs/SPEC.md) (the source of truth), and [PROGRESS.md](PROGRESS.md).**

## Key rules (full list: SPEC "How to work")
- Spec first: propose spec changes and get the user's OK before building something new or different. Update `docs/SPEC.md` in the same change as the code.
- Don't guess: if the spec is silent or unclear, ask, then write the answer into the spec (and log it under Decisions).
- Every feature gets Vitest and/or Playwright tests named after the spec rule they prove. Anything that shows text people type is tested with long text too: a long sentence, a paragraph, and an unbroken string like a pasted link (shared samples in `e2e/a11y.spec.ts`, checked at 320 px wide). Run the full suite before calling a step done and after every change. Mock the clock for anything time-dependent.
- Update `PROGRESS.md` at the end of each session.
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
- `npm run test:all` — everything CI runs
- `npm run test:db` — SQL rule checks (RLS) against dev; prints ✔/✘ per file. Only the user runs it (it confirms with --yes); ask first.
- `npx supabase db push --remote` — apply new migrations to the linked dev project (no Docker, so no local stack)
