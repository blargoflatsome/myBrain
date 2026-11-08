// Creates (or resets) three test accounts in the DEV Supabase project only: Dev Alice, Dev Bob and Dev Carol,
// for trying sharing and connections as more than one person. Their shared password is written to .env.local
// (DEV_TEST_PASSWORD, gitignored) and never printed. Run: npm run dev:accounts
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { TEST_USERS, devEnv, setEnv } from './dev-env.mjs'

const env = devEnv()
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✘ SUPABASE_SERVICE_ROLE_KEY (dev) is missing from .env.local.')
  process.exit(1)
}
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const password = env.DEV_TEST_PASSWORD || randomBytes(18).toString('base64url')

const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (listError) {
  console.error(`✘ Couldn't list users: ${listError.message}`)
  process.exit(1)
}
for (const u of TEST_USERS) {
  const existing = list.users.find((x) => x.email === u.email)
  const attrs = { password, email_confirm: true, user_metadata: { full_name: u.name } }
  const { data, error } = existing
    ? await admin.auth.admin.updateUserById(existing.id, attrs)
    : await admin.auth.admin.createUser({ email: u.email, ...attrs })
  if (error) {
    console.error(`✘ ${u.email}: ${error.message}`)
    process.exit(1)
  }
  // Fill the profile so the app doesn't ask for a phone number first.
  const { error: profileError } = await admin
    .from('profiles')
    .update({ display_name: u.name, email: u.email, phone: u.phone })
    .eq('user_id', data.user.id)
  if (profileError) console.error(`  (profile for ${u.email} not updated: ${profileError.message})`)
  console.log(`✔ ${existing ? 'Reset' : 'Created'} ${u.name} <${u.email}>`)
}
setEnv('DEV_TEST_PASSWORD', password)
setEnv('VITE_DEV_SIGN_IN', 'true')
console.log('✔ Password saved to .env.local as DEV_TEST_PASSWORD (not shown). Dev sign-in turned on for npm run dev.')
