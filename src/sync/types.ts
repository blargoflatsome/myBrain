// Offline-first sync (SPEC §7): a custom queue on Dexie. See engine.ts.

export const SYNC_TABLES = [
  'tasks',
  'vault_buckets',
  'vault_items',
  'quests',
  'inbox',
  'habits',
  'habit_logs',
  'routines',
  'routine_steps',
  'routine_runs',
  'routine_step_logs',
  'priority_tasks',
  'priority_task_logs',
  'reminder_state',
] as const
export type SyncTable = (typeof SYNC_TABLES)[number]

/** Columns every synced row has (SPEC §4). Timestamps are set by the server. */
export interface BaseRow {
  id: string
  user_id?: string
  created_at?: string
  updated_at?: string
  deleted_at: string | null
}

export interface TaskRow extends BaseRow {
  title: string
  notes?: string | null
  due_date: string | null
  priority?: number
  status: 'open' | 'done' | 'cancelled'
  completed_at?: string | null
  source: 'manual' | 'capture' | 'journal'
}

export interface VaultBucketRow extends BaseRow {
  name: string
  position: number
}

export interface VaultItemRow extends BaseRow {
  bucket_id: string
  title: string
  notes?: string | null
}

export type EnergyLevel = 'ugh' | 'fun' | 'needs_setup' | 'medicated'
export type TimeBucket = '30m' | '2h' | 'half_day' | 'full_day'

export interface QuestRow extends BaseRow {
  title: string
  details?: string | null
  energy_level?: EnergyLevel | null
  time_bucket?: TimeBucket | null
  status: 'open' | 'accepted' | 'done'
  last_picked_at?: string | null
  times_picked?: number
}

export interface InboxRow extends BaseRow {
  body: string
}

export interface HabitRow extends BaseRow {
  title: string
  /** 'HH:MM' or 'HH:MM:SS' local time; null = no reminder. */
  notify_time?: string | null
  /** Minutes after the notify time to complete it; null = due by midnight. */
  timer_minutes?: number | null
  /** 0 = Sunday ... 6 = Saturday. */
  weekdays: number[]
  /** First day the habit counts, YYYY-MM-DD. */
  start_date: string
  is_private: boolean
  /** Priority habits get the full-screen reminder and slider (SPEC §5). */
  is_priority?: boolean
  current_streak?: number
  best_streak?: number
}

export interface HabitLogRow extends BaseRow {
  habit_id: string
  /** YYYY-MM-DD */
  date: string
  status: 'completed' | 'missed'
  completed_at?: string | null
}

export interface RoutineRow extends BaseRow {
  title: string
  notify_time?: string | null
  /** 0 = Sunday ... 6 = Saturday. */
  weekdays: number[]
  start_date: string
}

export interface RoutineStepRow extends BaseRow {
  routine_id: string
  position: number
  title: string
  /** The day the step was added; its stats start here. */
  start_date: string
}

export interface RoutineRunRow extends BaseRow {
  routine_id: string
  date: string
  started_at: string
  finished_at?: string | null
}

export interface RoutineStepLogRow extends BaseRow {
  run_id: string
  step_id: string
  status: 'completed' | 'skipped'
  logged_at: string
}

export interface PriorityTaskRow extends BaseRow {
  title: string
  description?: string | null
  /** 'HH:MM' local time. */
  reminder_time: string
  /** One-off: the date. Repeating: null, and weekdays set. */
  due_date: string | null
  weekdays: number[] | null
  start_date: string
}

export interface PriorityTaskLogRow extends BaseRow {
  task_id: string
  date: string
  completed_at: string
}

export interface ReminderStateRow extends BaseRow {
  kind: 'habit' | 'routine' | 'priority_task'
  item_id: string
  date: string
  snoozed_until?: string | null
  cancelled_at?: string | null
  last_sent_at?: string | null
}

export interface RowTypes {
  tasks: TaskRow
  vault_buckets: VaultBucketRow
  vault_items: VaultItemRow
  quests: QuestRow
  inbox: InboxRow
  habits: HabitRow
  habit_logs: HabitLogRow
  routines: RoutineRow
  routine_steps: RoutineStepRow
  routine_runs: RoutineRunRow
  routine_step_logs: RoutineStepLogRow
  priority_tasks: PriorityTaskRow
  priority_task_logs: PriorityTaskLogRow
  reminder_state: ReminderStateRow
}

/** Thrown when the server can't be reached. The change stays queued and is retried later. */
export class NetworkError extends Error {
  constructor(message = 'Network unavailable') {
    super(message)
    this.name = 'NetworkError'
  }
}

/** The server side of sync. Supabase in the app, a fake in tests. */
export interface Remote {
  /** Insert or update one row; returns the row as stored (with server timestamps). */
  upsert<T extends SyncTable>(table: T, row: RowTypes[T]): Promise<RowTypes[T]>
  /** Rows changed at or after `since` (all rows when null), oldest first. */
  pullSince<T extends SyncTable>(table: T, since: string | null): Promise<RowTypes[T][]>
  /** Calls back when another device changes a table. Returns an unsubscribe function. */
  subscribe(onChange: (table: SyncTable) => void): () => void
}

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error'
export interface SyncStatus {
  state: SyncState
  pending: number
}
