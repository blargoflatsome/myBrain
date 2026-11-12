import Dexie, { type Table } from 'dexie'
import type { RowTypes, SyncTable } from './types'

export interface OutboxEntry {
  seq?: number
  table: SyncTable
  rowId: string
  row: RowTypes[SyncTable]
  /** Set when the server refused the change for a reason other than the network. */
  error?: string
}

export interface MetaEntry {
  key: string
  value: string
}

/** The on-device copy of the user's data plus the queue of changes waiting to upload (SPEC §7). */
export class LocalDb extends Dexie {
  tasks!: Table<RowTypes['tasks'], string>
  vault_buckets!: Table<RowTypes['vault_buckets'], string>
  vault_items!: Table<RowTypes['vault_items'], string>
  quests!: Table<RowTypes['quests'], string>
  inbox!: Table<RowTypes['inbox'], string>
  habits!: Table<RowTypes['habits'], string>
  habit_logs!: Table<RowTypes['habit_logs'], string>
  routines!: Table<RowTypes['routines'], string>
  routine_steps!: Table<RowTypes['routine_steps'], string>
  routine_runs!: Table<RowTypes['routine_runs'], string>
  routine_step_logs!: Table<RowTypes['routine_step_logs'], string>
  priority_tasks!: Table<RowTypes['priority_tasks'], string>
  priority_task_logs!: Table<RowTypes['priority_task_logs'], string>
  quest_logs!: Table<RowTypes['quest_logs'], string>
  badges!: Table<RowTypes['badges'], string>
  activity_log!: Table<RowTypes['activity_log'], string>
  reminder_state!: Table<RowTypes['reminder_state'], string>
  journal_entries!: Table<RowTypes['journal_entries'], string>
  events!: Table<RowTypes['events'], string>
  tags!: Table<RowTypes['tags'], string>
  item_tags!: Table<RowTypes['item_tags'], string>
  event_invites!: Table<RowTypes['event_invites'], string>
  availability_rules!: Table<RowTypes['availability_rules'], string>
  availability_exceptions!: Table<RowTypes['availability_exceptions'], string>
  post_its!: Table<RowTypes['post_its'], string>
  people!: Table<RowTypes['people'], string>
  notifications!: Table<RowTypes['notifications'], string>
  outbox!: Table<OutboxEntry, number>
  meta!: Table<MetaEntry, string>

  constructor(name: string) {
    super(name)
    this.version(1).stores({
      tasks: 'id, updated_at, due_date, status',
      vault_buckets: 'id, updated_at, position',
      vault_items: 'id, updated_at, bucket_id',
      quests: 'id, updated_at',
      inbox: 'id, updated_at',
      outbox: '++seq, table, rowId',
      meta: 'key',
    })
    // Habits and their daily logs.
    this.version(2).stores({
      habits: 'id, updated_at',
      habit_logs: 'id, updated_at, habit_id, date',
    })
    // Routines, their steps, daily runs and step logs.
    this.version(3).stores({
      routines: 'id, updated_at',
      routine_steps: 'id, updated_at, routine_id',
      routine_runs: 'id, updated_at, routine_id, date',
      routine_step_logs: 'id, updated_at, run_id, step_id',
    })
    // Priority tasks, their daily completions, and per-day reminder state (snooze / cancel).
    this.version(4).stores({
      priority_tasks: 'id, updated_at',
      priority_task_logs: 'id, updated_at, task_id, date',
      reminder_state: 'id, updated_at, item_id, date',
    })
    // Journal entries, one per day.
    this.version(5).stores({
      journal_entries: 'id, updated_at, date',
    })
    // Personal events, tags, and which items carry which tags.
    this.version(6).stores({
      events: 'id, updated_at, start_date',
      tags: 'id, updated_at',
      item_tags: 'id, updated_at, item_id, tag_id',
    })
    // Invitations (read-only here) and my availability.
    this.version(7).stores({
      event_invites: 'id, updated_at, event_id',
      availability_rules: 'id, updated_at',
      availability_exceptions: 'id, updated_at, date',
    })
    // Post Its on the Dashboard.
    this.version(8).stores({
      post_its: 'id, updated_at, position',
    })
    // Today's notifications on the Dashboard.
    this.version(9).stores({
      notifications: 'id, updated_at, local_date',
    })
    // My people: guests saved to invite again.
    this.version(10).stores({
      people: 'id, updated_at',
    })
    // Quests can be done again and again: each completion is logged.
    this.version(11).stores({
      quest_logs: 'id, updated_at, quest_id, date',
    })
    // Badges earned (SPEC §5 Celebrations).
    this.version(12).stores({
      badges: 'id, updated_at, kind',
    })
    // What trophies need that wasn't recorded before (SPEC §5 Trophies).
    this.version(13).stores({
      activity_log: 'id, updated_at, kind',
    })
  }

  rows<T extends SyncTable>(table: T): Table<RowTypes[T], string> {
    return this.table(table) as Table<RowTypes[T], string>
  }
}

/** Every row of several tables, read at the same time: `{ habitLogs: 'habit_logs' }` gives `{ habitLogs: [...] }`. */
export async function readTables<M extends Record<string, SyncTable>>(db: LocalDb, tables: M): Promise<{ [K in keyof M]: RowTypes[M[K]][] }> {
  const keys = Object.keys(tables) as (keyof M & string)[]
  const rows = await Promise.all(keys.map((k) => db.rows(tables[k]!).toArray()))
  return Object.fromEntries(keys.map((k, i) => [k, rows[i]])) as { [K in keyof M]: RowTypes[M[K]][] }
}
