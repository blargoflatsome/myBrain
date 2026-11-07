// In-memory stand-in for Supabase, used by tests. Behaves like the server rules in the migrations:
// the server sets created_at/updated_at, and the same id always means the same row.
import { NetworkError, type Remote, type RowTypes, type SyncTable } from './types'

export class FakeRemote implements Remote {
  online = true
  rejectNext: string | null = null
  upserts = 0
  private clock = 0
  private listeners = new Set<(table: SyncTable) => void>()
  readonly tables: { [T in SyncTable]: Map<string, RowTypes[T]> } = {
    tasks: new Map(),
    post_its: new Map(),
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
  }

  private now() {
    this.clock += 1
    return new Date(Date.UTC(2026, 10, 6, 12, 0, this.clock)).toISOString()
  }

  async upsert<T extends SyncTable>(table: T, row: RowTypes[T]): Promise<RowTypes[T]> {
    if (!this.online) throw new NetworkError()
    if (this.rejectNext) {
      const reason = this.rejectNext
      this.rejectNext = null
      throw new Error(reason)
    }
    this.upserts += 1
    const existing = this.tables[table].get(row.id)
    const now = this.now()
    const stored = { ...row, created_at: existing?.created_at ?? now, updated_at: now } as RowTypes[T]
    this.tables[table].set(row.id, stored)
    return stored
  }

  async pullSince<T extends SyncTable>(table: T, since: string | null): Promise<RowTypes[T][]> {
    if (!this.online) throw new NetworkError()
    return [...this.tables[table].values()]
      .filter((r) => !since || (r.updated_at ?? '') >= since)
      .sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''))
  }

  subscribe(onChange: (table: SyncTable) => void) {
    this.listeners.add(onChange)
    return () => this.listeners.delete(onChange)
  }

  /** Simulate another device writing directly to the server. */
  writeFromOtherDevice<T extends SyncTable>(table: T, row: RowTypes[T]) {
    const wasOnline = this.online
    this.online = true
    void this.upsert(table, row)
    this.online = wasOnline
    this.listeners.forEach((l) => l(table))
  }
}
