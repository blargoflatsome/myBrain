# My Brain

A personal productivity and "boredom buster" app for capturing everything you need to remember: tasks, habits, routines, a journal, The Vault, and a Random Quest picker. Installable as a PWA on Android, on an iPhone from the Home Screen, and on desktop.

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

## Run your own copy
Anything made with AI should be free, so you're welcome to build your own My Brain. All I ask is that you keep the footer credit ("Conceived of by Jordan Buermann © <this year>", linking to my LinkedIn) so I get credit for my part of the work.

The code is under the [MIT License](LICENSE): use, change and share it freely, as long as copies keep the copyright notice.

Everything below uses free tiers. You need Node 22+, Git, a GitHub account, a Supabase account and a Netlify account.

1. **Get the code.** Fork this repository on GitHub (so Netlify can deploy your fork), then:
   ```bash
   git clone https://github.com/<your-username>/myBrain.git
   cd myBrain
   npm install
   cp .env.example .env.local
   ```
2. **Create a Supabase project** (supabase.com → New project). From Project Settings → API copy the Project URL and the anon key into `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, and the service role key into `SUPABASE_SERVICE_ROLE_KEY` (server only, never in the browser).
3. **Create the database.** Link the project and apply the migrations:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   Before pushing, search `supabase/migrations/` for `myadhdbrain.netlify.app` and change it to your own site's address (notification links use it), or add a new migration that does.
4. **Turn on Google sign-in.** In Google Cloud Console create an OAuth client (Web application) with Supabase's callback URL (`https://<your-project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI. Paste its client ID and secret into Supabase → Authentication → Sign In / Providers → Google. In Authentication → URL Configuration set the Site URL to your Netlify address and add `http://localhost:5173` for local work.
5. **Make push notification keys** (optional, for reminders):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Put the public key in `VITE_VAPID_PUBLIC_KEY` and `VAPID_PUBLIC_KEY`, the private key in `VAPID_PRIVATE_KEY`, and `mailto:you@example.com` in `VAPID_SUBJECT`. Pick a long random `PUSH_SECRET`.
6. **Run it locally:** `npm run dev`, then open the address it prints.
7. **Deploy on Netlify.** Add new site → Import from GitHub → your fork. The build settings come from `netlify.toml`. Under Site configuration → Environment variables add every value from `.env.local` except the dev-only ones. Deploy.
8. **Connect reminders to the push function** (optional). In Supabase → Project Settings → Vault add two secrets: `push_function_url` = `https://<your-site>.netlify.app/.netlify/functions/send-push`, and `push_secret` = the same `PUSH_SECRET`. The reminder jobs are already scheduled by the migrations (Supabase Cron).

Check it all with `npm run test:quick`. The spec in [docs/SPEC.md](docs/SPEC.md) explains every feature, and [CLAUDE.md](CLAUDE.md) is the rulebook if you build with Claude Code.

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

## License
[MIT](LICENSE) © Jordan Buermann
