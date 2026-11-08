// Stands in for Supabase in browser tests: a signed-in session plus an in-memory REST API with server timestamps.
import type { Page, Request } from '@playwright/test'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), 'VITE_')
const supabaseUrl = env.VITE_SUPABASE_URL || 'http://localhost:54321'
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111'

type Row = Record<string, unknown> & { id: string }

function fakeJwt() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 365
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: TEST_USER_ID, role: 'authenticated', aud: 'authenticated', exp })}.sig`
}

export class FakeSupabase {
  readonly tables: Record<string, Map<string, Row>> = {
    tasks: new Map(),
    post_its: new Map(),
    people: new Map(),
    notifications: new Map(),
    vault_buckets: new Map(),
    vault_items: new Map(),
    quests: new Map(),
    inbox: new Map(),
    habits: new Map(),
    habit_logs: new Map(),
    routines: new Map(),
    routine_steps: new Map(),
    routine_runs: new Map(),
    routine_step_logs: new Map(),
    priority_tasks: new Map(),
    priority_task_logs: new Map(),
    reminder_state: new Map(),
    journal_entries: new Map(),
    events: new Map(),
    tags: new Map(),
    item_tags: new Map(),
    event_invites: new Map(),
    availability_rules: new Map(),
    availability_exceptions: new Map(),
    profiles: new Map(),
  }
  readonly writes: { table: string; row: Row }[] = []
  private clock = 0

  constructor() {
    // Starter buckets, as the database creates them on sign-up (SPEC §5 The Vault).
    ;['Shopping list', 'Restaurant reviews', 'Places to go'].forEach((name, position) =>
      this.store('vault_buckets', { id: `bucket-${position}`, user_id: TEST_USER_ID, name, position, checkable: position === 0, deleted_at: null }),
    )
    // The profile the database creates on first sign-in (SPEC §4), private by default.
    this.store('profiles', {
      id: 'profile-1',
      user_id: TEST_USER_ID,
      display_name: 'Test Person',
      bio: null,
      avatar_url: null,
      streak_visibility: 'private',
      phone: '+1 555 010 0100',
      event_notify_method: 'email',
      findable: true,
      share_availability: true,
      cancel_dropout_message: "Hi {{name}}, I'm sorry, but I can't make it to {{event}} on {{date}} at {{time}}. Sorry for the short notice!",
      cancel_event_message: "Hi {{name}}, I'm sorry, but I have to cancel {{event}} on {{date}} at {{time}}. Sorry for the short notice!",
      timezone: 'UTC',
      deleted_at: null,
    })
  }

  get profile() {
    return this.tables.profiles!.get('profile-1')!
  }

  /** Put rows on the "server" as if another device had saved them. */
  seed(table: string, rows: Row[]) {
    rows.forEach((r) => this.store(table, { user_id: TEST_USER_ID, deleted_at: null, ...r }))
  }

  private store(table: string, row: Row) {
    this.clock += 1
    const now = new Date(Date.UTC(2026, 10, 6, 12, 0, this.clock)).toISOString()
    const existing = this.tables[table]!.get(row.id)
    // Like the database: created_at is set once (a seeded row may bring its own), updated_at on every write.
    const stored = { ...row, created_at: existing?.created_at ?? (row.created_at as string | undefined) ?? now, updated_at: now }
    this.tables[table]!.set(row.id, stored)
    return stored
  }

  /** Sign the browser in as the test user and route all Supabase traffic here. */
  async install(page: Page) {
    const session = {
      access_token: fakeJwt(),
      refresh_token: 'fake-refresh',
      token_type: 'bearer',
      expires_in: 86400 * 365,
      expires_at: Math.floor(Date.now() / 1000) + 86400 * 365, // far ahead: tests move the clock forward
      user: { id: TEST_USER_ID, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid' },
    }
    await page.addInitScript(
      ([key, value]) => {
        if (!localStorage.getItem(key!)) localStorage.setItem(key!, value!)
      },
      [storageKey, JSON.stringify(session)],
    )

    await page.routeWebSocket(/\/realtime\/v1\//, () => {
      // Accept and stay silent: Realtime is covered by the sync engine's unit tests.
    })
    await page.route(/\/auth\/v1\//, (route) => route.fulfill({ json: session.user }))
    await page.route(/\/rest\/v1\//, (route) => route.fulfill(this.handle(route.request())))
  }

  private handle(req: Request) {
    const url = new URL(req.url())
    const table = url.pathname.split('/').pop()!
    const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
    if (req.method() === 'GET') {
      const rows = [...(this.tables[table]?.values() ?? [])]
      return { json: single ? (rows[0] ?? null) : rows }
    }
    if (req.method() === 'PATCH' && table === 'profiles') {
      const body = req.postDataJSON() as Partial<Row>
      // The app quietly keeps the timezone in step on every start; only count edits the user made.
      if (Object.keys(body).some((k) => k !== 'timezone')) this.writes.push({ table, row: { ...this.profile, ...body } })
      this.store('profiles', { ...this.profile, ...body })
      return { status: 204, body: '' }
    }
    if (req.method() === 'POST' && url.pathname.includes('/rpc/')) {
      if (this.failRpc) return { status: 503, json: { message: 'unavailable' } }
      this.rpcCalls.push(table)
      const args = (req.postDataJSON() ?? {}) as Record<string, unknown>
      this.rpcArgs.push({ name: table, args })
      const result = this.rpcResults[table]
      if (result === undefined) return { status: 204, body: '' }
      return { json: typeof result === 'function' ? (result as (a: Record<string, unknown>) => unknown)(args) : result }
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Row
      const row = { user_id: TEST_USER_ID, ...body }
      this.writes.push({ table, row })
      const stored = this.store(table, row)
      return { json: single ? stored : [stored], status: 201 }
    }
    return { status: 204, body: '' }
  }

  /** Database functions the app called (for example delete_my_account). */
  rpcCalls: string[] = []
  /** Make database function calls fail, as if the server could not be reached. */
  failRpc = false
  /** Each database function call with its arguments. */
  rpcArgs: { name: string; args: Record<string, unknown> }[] = []
  /** What a database function returns: a value, or a function of its arguments. Unset = no content. */
  rpcResults: Record<string, unknown> = {}

  /** Remove every row from a table, as the server would after a delete. */
  clear(table: string) {
    this.tables[table]?.clear()
  }

  /** Change the stored profile, as another device would. */
  setProfile(changes: Record<string, unknown>) {
    this.store('profiles', { ...this.profile, ...changes })
  }

  written(table: string) {
    return this.writes.filter((w) => w.table === table).map((w) => w.row)
  }
}
