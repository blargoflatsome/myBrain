// Quick capture (SPEC §5): one thought, filed as a task, vault item, quest, habit, or saved to Orphans to decide later.
import type { EnergyLevel, HabitRow, InboxRow, QuestRow, TaskRow, TimeBucket, VaultBucketRow, VaultItemRow } from '@/sync/types'
import { newHabit } from '@/habits/rules'
import { clampRating } from '@/vault/rules'
import { deviceTimeZone } from '@/tasks/days'
import { toEditorHtml } from '@/journal/body'

export type Destination = 'task' | 'vault' | 'quest' | 'habit' | 'postit' | 'later'

/** Defaults for every new quest (SPEC §5 Random Quest). */
export const DEFAULT_QUEST_ENERGY: EnergyLevel = 'ugh'
export const DEFAULT_QUEST_TIME: TimeBucket = '30m'
/** Default task priority: Low (SPEC §5 Tasks). */
export const DEFAULT_TASK_PRIORITY = 1

export interface CaptureInput {
  /** The title (or the Decide later text). The only required field. */
  text: string
  destination: Destination
  /** Task notes, vault item notes, or quest details. Optional. */
  notes?: string | null
  /** Task only. Optional: blank means the Undated list. Format YYYY-MM-DD. */
  dueDate?: string | null
  /** Task only. 1 Low (default), 2 Medium, 3 High. */
  priority?: number
  /** Vault only. */
  bucketId?: string
  /** Vault only, optional (SPEC §5 Forms: the same form as the item editor). */
  rating?: number | null
  link?: string | null
  /** Quest only. Default Ugh. */
  energy?: EnergyLevel
  /** Quest only. Default 30 min. */
  time?: TimeBucket
  /** Habit only (SPEC §5 Quick capture: the full habit form). */
  habit?: {
    weekdays: number[]
    weekInterval: number
    /** Every month on the start date's day (SPEC §5 Habits). */
    monthly?: boolean
    /** Today or later; today when not given. */
    startDate?: string | null
    notifyTime: string | null
    timerMinutes: number | null
    isPriority: boolean
  }
}

export type CaptureRecord =
  | { table: 'tasks'; row: TaskRow }
  | { table: 'vault_items'; row: VaultItemRow }
  | { table: 'quests'; row: QuestRow }
  | { table: 'inbox'; row: InboxRow }
  | { table: 'habits'; row: HabitRow }

export class CaptureError extends Error {}

export const TITLE_MAX = 500

/** The first line (up to TITLE_MAX characters) as the title; the rest of the text goes in front of the notes. */
export function fitTitle(text: string, notes?: string | null): { title: string; notes: string | null } {
  const trimmed = text.trim()
  const lineEnd = trimmed.search(/\r?\n/)
  let title = lineEnd >= 0 ? trimmed.slice(0, lineEnd).trim() : trimmed
  let rest = lineEnd >= 0 ? trimmed.slice(lineEnd).trim() : ''
  if (title.length > TITLE_MAX) {
    // The whole long first line is kept in the notes; the title is a shortened copy.
    rest = [title, rest].filter(Boolean).join('\n')
    title = `${title.slice(0, TITLE_MAX - 1).trimEnd()}…`
  }
  const kept = notes?.trim()
  // Formatted notes (SPEC §5 Formatted notes) get the rest of the text as paragraphs in front.
  if (kept?.startsWith('<')) return { title, notes: (rest ? toEditorHtml(rest) : '') + kept }
  const allNotes = [rest, kept].filter(Boolean).join('\n\n')
  return { title, notes: allNotes || null }
}

/** Turns a capture into the row to save. Ids are made on the device so offline saves sync without duplicates. */
export function buildCaptureRecord(input: CaptureInput, userId: string, newId: () => string = () => crypto.randomUUID()): CaptureRecord {
  const text = input.text.trim()
  if (!text) throw new CaptureError('empty')
  // A title is one line of at most 500 characters (docs/SPEC.md §8 limits); anything longer moves into the notes.
  const fitted = input.destination === 'later' ? { title: text, notes: input.notes?.trim() || null } : fitTitle(text, input.notes)
  const notes = fitted.notes
  const base = { id: newId(), user_id: userId, deleted_at: null }

  switch (input.destination) {
    case 'task':
      return {
        table: 'tasks',
        row: {
          ...base,
          title: fitted.title,
          notes,
          due_date: input.dueDate || null,
          priority: input.priority ?? DEFAULT_TASK_PRIORITY,
          status: 'open',
          source: 'capture',
        },
      }
    case 'vault':
      if (!input.bucketId) throw new CaptureError('bucket')
      return { table: 'vault_items', row: { ...base, bucket_id: input.bucketId, title: fitted.title, notes, rating: clampRating(input.rating ?? null), link: input.link?.trim() || null } }
    case 'quest':
      return {
        table: 'quests',
        row: {
          ...base,
          title: fitted.title,
          details: notes,
          energy_level: input.energy ?? DEFAULT_QUEST_ENERGY,
          time_bucket: input.time ?? DEFAULT_QUEST_TIME,
          status: 'open',
          times_picked: 0,
        },
      }
    case 'habit': {
      const h = input.habit
      const row = newHabit(fitted.title, userId, deviceTimeZone(), new Date(), base.id)
      return {
        table: 'habits',
        row: {
          ...row,
          weekdays: h?.weekdays.length ? [...h.weekdays].sort() : row.weekdays,
          week_interval: h?.weekInterval ?? 1,
          monthly: !!h?.monthly,
          start_date: h?.startDate && h.startDate > row.start_date ? h.startDate : row.start_date,
          notify_time: h?.notifyTime || null,
          // A timer needs a reminder time (SPEC §5 Habits).
          timer_minutes: h?.notifyTime && h.timerMinutes ? h.timerMinutes : null,
          is_priority: !!h?.isPriority,
        },
      }
    }
    case 'later':
      return { table: 'inbox', row: { ...base, body: text } }
    case 'postit':
      // Post Its are formatted notes, saved with brain.addPostIt (SPEC §5 Post It).
      throw new CaptureError('post it')
  }
}

/** Orphans in the order I sort them: oldest first (SPEC §5 Orphans). */
export function oldestFirst(items: InboxRow[]): InboxRow[] {
  return [...items].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id))
}

/** Splits shared or long text into a title (first line) and the rest (notes/details). */
export function splitTitle(text: string): { title: string; rest: string } {
  const [first = '', ...more] = text.trim().split(/\r?\n/)
  return { title: first.trim(), rest: more.join('\n').trim() }
}

export function buildBucket(name: string, position: number, userId: string, newId: () => string = () => crypto.randomUUID()): VaultBucketRow {
  const trimmed = name.trim()
  if (!trimmed) throw new CaptureError('bucket-name')
  return { id: newId(), user_id: userId, name: trimmed, position, deleted_at: null }
}

export type ConvertibleTable = CaptureRecord['table']

/** The words an item holds, whatever its type. */
export function textOf(record: CaptureRecord): string {
  switch (record.table) {
    case 'tasks':
    case 'vault_items':
    case 'quests':
    case 'habits':
      return record.row.title
    case 'inbox':
      return record.row.body
  }
}

/**
 * SPEC §5: any item can be converted to another type (for example a vault item into a task), and filing an
 * inbox item is the same thing. Creates the new item and soft-deletes the original so the move syncs everywhere.
 */
export function buildConversion(
  from: CaptureRecord,
  to: Omit<CaptureInput, 'text'>,
  userId: string,
  newId?: () => string,
): { create: CaptureRecord; retire: { table: ConvertibleTable; id: string } } {
  return {
    create: buildCaptureRecord({ ...to, text: textOf(from) }, userId, newId),
    retire: { table: from.table, id: from.row.id },
  }
}

/** Reads the text shared into the app (Web Share Target, SPEC §3) from the capture URL's query. */
export function sharedText(query: Record<string, unknown>): string {
  const parts = ['title', 'text', 'url']
    .map((k) => (typeof query[k] === 'string' ? (query[k] as string).trim() : ''))
    .filter(Boolean)
  return [...new Set(parts)].join('\n')
}
