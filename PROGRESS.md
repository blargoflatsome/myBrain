# Progress

Tracks build steps from [docs/SPEC.md §11](docs/SPEC.md#11-suggested-build-order). Update at the end of every session.

## Step 1 — Foundation (in progress)

Done:
- Spec saved to `docs/SPEC.md`; `CLAUDE.md` and this file created.
- Vue 3 + Vite + TypeScript + Tailwind v4 + Vue Router + Pinia scaffold (§3).
- Vitest with first passing test; Playwright (desktop Chromium + Pixel 7) with first passing tests (§3 Testing).
- ESLint + `vue-tsc` type checking.
- GitHub Actions CI: lint, typecheck, Vitest, Playwright on every PR and push to main (§3).
- `netlify.toml` (build, SPA redirect, functions dir) and `.env.example` (§13).

Next (needs the user — §13 account walkthrough):
- ~~Domain name question~~ — answered: none for now (SPEC §13, §14).
- ~~Netlify deploy budget~~ — decided: merge to main once per build step (SPEC §3, §14).
- ~~Netlify site~~ — created: https://myadhdbrain.netlify.app (first `main` build expected to fail until step 1 is merged).
- ~~Two Supabase projects~~ — created (dev + prod, us-east-1); CLI linked to dev; dev keys in `.env.local` and verified.
- Google Cloud OAuth client for Google sign-in through Supabase.
- Supabase CLI, migrations folder, base schema with RLS; Google sign-in in the app.

## Tests without a rule yet
- None so far.

## Decisions
See the Decisions list in `docs/SPEC.md`.
