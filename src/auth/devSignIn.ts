// Dev-only password sign-in (SPEC §3 Testing): shown only on the local dev server (never in a production build) and
// only when VITE_DEV_SIGN_IN is true, which `npm run dev:accounts` sets in .env.local.
export function devSignInEnabled(env: { DEV?: boolean; VITE_DEV_SIGN_IN?: string }): boolean {
  return env.DEV === true && env.VITE_DEV_SIGN_IN === 'true'
}
