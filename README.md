# My Brain

A personal productivity and "boredom buster" app for capturing everything you need to remember: tasks, habits, routines, a journal, The Vault, and a Random Quest picker. Installable as a PWA on Android, usable on desktop and on a Raspberry Pi touch display.

Live app: https://myadhdbrain.netlify.app (deployed from `main`).

The full spec lives in [docs/SPEC.md](docs/SPEC.md). Progress is tracked in [PROGRESS.md](PROGRESS.md).

## Stack
Vue 3 + Vite + TypeScript + Tailwind CSS, Vue Router, Pinia · Supabase (Postgres, auth, RLS, Realtime) · Netlify (hosting + Functions) · Vitest + Playwright · GitHub Actions.

## Getting started
```bash
npm install
cp .env.example .env.local   # fill in values (see below)
npm run dev
```

## Testing
```bash
npm test            # Vitest
npx playwright install chromium   # first time only
npm run test:e2e    # Playwright
npm run test:all    # lint + typecheck + all tests (what CI runs)
```

## Environment variables
See `.env.example`. Only `VITE_`-prefixed values reach the browser; everything else is server-side only (Netlify environment variables). Where each value comes from is documented as each service is set up.

## Key decisions
See [docs/DECISIONS.md](docs/DECISIONS.md).
