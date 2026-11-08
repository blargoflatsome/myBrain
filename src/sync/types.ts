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
  'event_invites',
  'availability_rules',
  'availability_exceptions',
  'post_its',
  'notifications',
  'people',
] as const

/** Tables the app only reads: changes go through server functions (SPEC §5 Shared events). */
export const READ_ONLY_TABLES: readonly SyncTable[] = ['event_invites']
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

/** A notification sent today, for the Dashboard's list (SPEC §5 Dashboard). Written by the server; I can clear it. */
export interface NotificationRow extends BaseRow {
  kind: string
  item_id: string | null
  title: string
  body: string
  /** A page of this app ("/habits"). */
  url: string
  local_date: string
  sent_at: string
}

export type PostItColor = 'yellow' | 'pink' | 'blue' | 'green'

/** A sticky note at the top of the Dashboard (SPEC §5 Post It). */
export interface PostItRow extends BaseRow {
  /** Formatted HTML, like the journal. */
  body: string
  color: PostItColor
  /** Lowest first; a new note goes in front. */
  position: number
}

/** My people (SPEC §5 Calendar): someone I've invited by email or phone, saved to invite again. */
export interface PersonRow extends BaseRow {
  name: string | null
  email: string | null
  phone: string | null
}

export interface VaultBucketRow extends BaseRow {
  name: string
  position: number
  /** Items can be checked off (SPEC §5 The Vault; on for the Shopping list). */
  checkable?: boolean
  /** Starred: shown as a card on the Dashboard with its newest items. */
  starred?: boolean
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

export type EventRepeat = 'never' | 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'yearly'

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
  /** Set when the creator cancelled it for everyone (SPEC §5 Cancelling). */
  cancelled_at?: string | null
  /** Whether attendees can see who else is going (SPEC §10 Connections); on by default. */
  show_guests?: boolean
}

export type InviteResponse = 'pending' | 'yes' | 'maybe' | 'no' | 'dropped'

/** One person invited to an event. Read-only in the app; changed through server functions. */
export interface EventInviteRow extends BaseRow {
  event_id: string
  host_name?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  response: InviteResponse
  /** Whether this attendee shows to the event's other attendees (SPEC §10 Connections). */
  visible?: boolean
  responded_at?: string | null
}

/** A weekly time I'm unavailable (SPEC §5 Availability schedule). */
export interface AvailabilityRuleRow extends BaseRow {
  weekday: number
  start_time: string
  end_time: string
}

/** A one-off change for a date: unavailable (or available) all day or for a time range. */
export interface AvailabilityExceptionRow extends BaseRow {
  date: string
  start_time: string | null
  end_time: string | null
  kind: 'unavailable' | 'available'
  note?: string | null
}

export interface TagRow extends BaseRow {
  name: string
}

/** Tags go on tasks, habits and routines only (SPEC §5 Global search and tags). */
export type TaggedType = 'task' | 'habit' | 'routine'

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
  /** 1 = every week, 2 = every 2 weeks (counted from the week it started). */
  week_interval?: number
  /** Every month on the start date's day of the month (SPEC §5 Habits). */
  monthly?: boolean
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
  /** 1 = every week, 2 = every 2 weeks (counted from the week it started). */
  week_interval?: number
  title: string
  notify_time?: string | null
  /** 0 = Sunday ... 6 = Saturday; null = run anytime (no schedule, no reminder). */
  weekdays: number[] | null
  start_date: string
}

export interface RoutineStepRow extends BaseRow {
  routine_id: string
  position: number
  /** The step's text; for a habit step, the habit's name when it was added (the habit's current name is shown). */
  title: string
  /** A habit step: completing it completes this habit for the day (SPEC §5 Routines). */
  habit_id?: string | null
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
  /** 1 = every week, 2 = every 2 weeks (counted from the week it started). */
  week_interval?: number
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
  /** "How to make tomorrow better?" (formatted HTML like the body; older answers may be plain text). */
  tomorrow?: string
  /** "Was today better than yesterday?" (null = not answered). */
  better_than_yesterday?: boolean | null
}

export interface RowTypes {
  notifications: NotificationRow
  post_its: PostItRow
  people: PersonRow
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
  event_invites: EventInviteRow
  availability_rules: AvailabilityRuleRow
  availability_exceptions: AvailabilityExceptionRow
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
