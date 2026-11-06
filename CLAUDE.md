# My Brain — Claude Code rules

**Start every session by reading this file, [docs/SPEC.md](docs/SPEC.md) (the source of truth), and [PROGRESS.md](PROGRESS.md).**

## Key rules (full list: SPEC "How to work")
- Spec first: propose spec changes and get the user's OK before building something new or different. Update `docs/SPEC.md` in the same change as the code.
- Don't guess: if the spec is silent or unclear, ask, then write the answer into the spec (and log it under Decisions).
- Every feature gets Vitest and/or Playwright tests named after the spec rule they prove. Run the full suite before calling a step done and after every change. Mock the clock for anything time-dependent.
- Update `PROGRESS.md` at the end of each session.
- Secrets live only in `.env.local` (gitignored) and Netlify env vars. Only the Supabase anon key may reach the browser. Ask for each credential when first needed.
- Every table: `id, user_id, created_at, updated_at (server-set), deleted_at`, with RLS.
- All user-facing wording in the "past you" voice, kept in one messages file.
- Confirm before anything that removes data or affects other users.

## Commands
- `npm run dev` — dev server
- `npm run build` — type-check and build to `dist/`
- `npm run lint` / `npm run typecheck`
- `npm test` — Vitest (unit/integration, `src/**/*.test.ts`)
- `npm run test:e2e` — Playwright (`e2e/`, desktop + Pixel 7; builds and serves on :4173)
- `npm run test:all` — everything CI runs
