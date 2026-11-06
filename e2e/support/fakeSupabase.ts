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
    vault_buckets: new Map(),
    vault_items: new Map(),
    quests: new Map(),
    inbox: new Map(),
  }
  readonly writes: { table: string; row: Row }[] = []
  private clock = 0

  constructor() {
    // Starter buckets, as the database creates them on sign-up (SPEC §5 The Vault).
    ;['Shopping list', 'Restaurant reviews', 'Places to go'].forEach((name, position) =>
      this.store('vault_buckets', { id: `bucket-${position}`, user_id: TEST_USER_ID, name, position, deleted_at: null }),
    )
  }

  /** Put rows on the "server" as if another device had saved them. */
  seed(table: string, rows: Row[]) {
    rows.forEach((r) => this.store(table, { user_id: TEST_USER_ID, deleted_at: null, ...r }))
  }

  private store(table: string, row: Row) {
    this.clock += 1
    const now = new Date(Date.UTC(2026, 10, 6, 12, 0, this.clock)).toISOString()
    const existing = this.tables[table]!.get(row.id)
    const stored = { ...row, created_at: existing?.created_at ?? now, updated_at: now }
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
    if (req.method() === 'GET') {
      const rows = [...(this.tables[table]?.values() ?? [])]
      return { json: rows }
    }
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Row
      const row = { user_id: TEST_USER_ID, ...body }
      this.writes.push({ table, row })
      const stored = this.store(table, row)
      const single = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
      return { json: single ? stored : [stored], status: 201 }
    }
    return { status: 204, body: '' }
  }

  written(table: string) {
    return this.writes.filter((w) => w.table === table).map((w) => w.row)
  }
}
