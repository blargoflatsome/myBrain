// Walks the Connections and sharing flows against the real DEV backend as the test accounts from
// `npm run dev:accounts`, through the same server calls the app makes. Prints ✔/✘ per step and tidies up after.
// Never runs against production. Run: npm run test:flows
import { createClient } from '@supabase/supabase-js'
import { TEST_USERS, devEnv } from './dev-env.mjs'

const env = devEnv()
if (!env.DEV_TEST_PASSWORD) {
  console.error('✘ No test accounts yet. Run npm run dev:accounts first.')
  process.exit(1)
}
const client = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const [A, B, C] = TEST_USERS
let failures = 0
function check(ok, rule, detail = '') {
  if (ok) console.log(`✔ ${rule}`)
  else {
    failures++
    console.log(`✘ ${rule}${detail ? ` (${detail})` : ''}`)
  }
}
async function signIn(u) {
  const c = client()
  const { data, error } = await c.auth.signInWithPassword({ email: u.email, password: env.DEV_TEST_PASSWORD })
  if (error) {
    console.error(`✘ Couldn't sign in as ${u.name}: ${error.message}. Is email sign-in turned on for the dev project?`)
    process.exit(1)
  }
  return { c, id: data.user.id }
}
const rpc = async (who, fn, args = {}) => {
  const { data, error } = await who.c.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data
}

const alice = await signIn(A)
const bob = await signIn(B)
const carol = await signIn(C)
let eventId = null

try {
  // Start clean: no connections between the test accounts.
  await rpc(alice, 'remove_connection', { friend: bob.id })
  await rpc(alice, 'remove_connection', { friend: carol.id })
  for (const r of await rpc(alice, 'sent_connection_requests')) await rpc(alice, 'cancel_connection_request', { req: r.id })

  // Part 1: a request by email, answered.
  await rpc(alice, 'request_connection', { contact: B.email.toUpperCase() })
  const incoming = await rpc(bob, 'incoming_connection_requests')
  const req = incoming.find((r) => r.display_name === A.name)
  check(!!req, 'A request by email reaches the person, whatever the case typed')
  if (req) await rpc(bob, 'answer_connection_request', { req: req.id, answer: 'accept' })
  check((await rpc(alice, 'my_connections')).some((x) => x.friend_id === bob.id), 'Accepting connects both people')

  // Inviting a connection in the app, and who's going.
  const { data: ev, error: evError } = await alice.c
    .from('events')
    .insert({ user_id: alice.id, title: 'Flow test picnic', start_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), end_date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), repeat: 'never' })
    .select()
    .single()
  if (evError) throw new Error(`create event: ${evError.message}`)
  eventId = ev.id
  const created = await rpc(alice, 'invite_people', { event: eventId, people: [{ user_id: bob.id, name: B.name }, { email: 'flow-guest@myadhdbrain.test', name: 'Gus Guest' }] })
  check(created.length === 2 && !created.find((x) => x.name === B.name)?.token, 'A connection is invited in the app; a typed email gets a guest link')
  const { data: bobInvites } = await bob.c.from('event_invites').select('id, event_id').eq('event_id', eventId)
  check((bobInvites ?? []).length === 1, 'The invitation shows up for the connection')
  if (bobInvites?.[0]) await rpc(bob, 'respond_to_invite', { invite: bobInvites[0].id, answer: 'yes' })
  const going = await rpc(bob, 'event_attendees', { event: eventId })
  check(going.some((x) => x.is_host) && going.some((x) => x.display_name === 'Gus'), "Who's going shows the host and guests by first name")

  // Guest page works without an account.
  const guest = created.find((x) => x.token)
  const anon = client()
  const { data: page } = await anon.rpc('guest_invite', { invite: guest.invite_id, token: guest.token })
  check(page?.[0]?.title === 'Flow test picnic' && page[0].passed === false, 'A guest opens their link without an account')

  // Scheduling between connections.
  const busy = await rpc(alice, 'free_busy', { people: [bob.id] })
  check(Array.isArray(busy), "A connection's free/busy can be read")
  const strangers = await rpc(carol, 'free_busy', { people: [alice.id] })
  check(strangers.length === 0, "Someone not connected can't read free/busy")

  // Part 2: a connect link.
  const [link] = await rpc(alice, 'create_connect_link')
  const preview = await rpc(carol, 'preview_connect_link', { token: link.token, code: null })
  check(preview?.[0]?.display_name === A.name, 'Opening a connect link shows whose it is')
  check((await rpc(carol, 'use_connect_link', { token: link.token, code: null })) === A.name, 'Using a connect link connects straight away')
  check((await rpc(bob, 'use_connect_link', { token: link.token, code: null })) === null, 'A connect link works for one person only')
} catch (e) {
  failures++
  console.log(`✘ ${e.message}`)
} finally {
  // Tidy up: the event and the connections go.
  if (eventId) await alice.c.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', eventId)
  await alice.c.rpc('remove_connection', { friend: bob.id })
  await alice.c.rpc('remove_connection', { friend: carol.id })
}
console.log(failures ? `\n${failures} step(s) failed.` : '\nAll flow steps passed on dev.')
process.exit(failures ? 1 : 0)
