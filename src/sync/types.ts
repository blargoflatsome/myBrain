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
  'journal_entries',
  'events',
  'tags',
  'item_tags',
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
  /** Items can be checked off (SPEC §5 The Vault; on for the Shopping list). */
  checkable?: boolean
}

export interface VaultItemRow extends BaseRow {
  bucket_id: string
  title: string
  notes?: string | null
  /** 1-5 stars, optional. */
  rating?: number | null
  /** A web link or a place address, optional. */
  link?: string | null
  /** Checked off, in a checklist bucket. */
  checked?: boolean
}

export type EventRepeat = 'never' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

/** A personal calendar event (SPEC §5 Calendar and reminders). Local dates and times; no start time = all day. */
export interface EventRow extends BaseRow {
  title: string
  notes?: string | null
  start_date: string
  start_time: string | null
  end_date: string
  end_time: string | null
  repeat: EventRepeat
  /** Minutes before the start (all-day events count from 9:00 am); null = no reminder. */
  reminder_minutes: number | null
}

export interface TagRow extends BaseRow {
  name: string
}

export type TaggedType = 'task' | 'vault_item' | 'journal_entry' | 'quest' | 'event'

export interface ItemTagRow extends BaseRow {
  tag_id: string
  item_type: TaggedType
  item_id: string
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
  /** When it was marked done (SPEC §5 Journal counts completed quests by day). */
  completed_at?: string | null
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
  kind: 'habit' | 'routine' | 'priority_task' | 'journal' | 'event'
  item_id: string
  date: string
  snoozed_until?: string | null
  cancelled_at?: string | null
  last_sent_at?: string | null
}

/** The stats added to a journal entry (SPEC §5 Journal). */
export interface JournalStats {
  tasks: { done: number; due: number }
  habits: { kept: number; scheduled: number }
  routines: { id: string; title: string; done: number; total: number }[]
  priority: { title: string; done: boolean }[]
  streaks: { title: string; kind: 'reached' | 'reset'; days: number }[]
  quests: string[]
}

export interface JournalEntryRow extends BaseRow {
  /** 'YYYY-MM-DD', one entry per day. */
  date: string
  body: string
  stats: JournalStats | Record<string, never>
  /** True once the day ended and the stats are frozen. */
  stats_final: boolean
  /** True when the app wrote the entry on my behalf for a missed day. */
  auto: boolean
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
  journal_entries: JournalEntryRow
  events: EventRow
  tags: TagRow
  item_tags: ItemTagRow
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
