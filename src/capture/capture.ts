// Quick capture (SPEC §5): one thought, filed as a task, vault item, quest, or saved to the inbox to decide later.
import type { EnergyLevel, InboxRow, QuestRow, TaskRow, TimeBucket, VaultBucketRow, VaultItemRow } from '@/sync/types'

export type Destination = 'task' | 'vault' | 'quest' | 'later'

/** Defaults for every new quest (SPEC §5 Random Quest). */
export const DEFAULT_QUEST_ENERGY: EnergyLevel = 'meh'
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
  /** Quest only. Default Meh. */
  energy?: EnergyLevel
  /** Quest only. Default 30 min. */
  time?: TimeBucket
}

export type CaptureRecord =
  | { table: 'tasks'; row: TaskRow }
  | { table: 'vault_items'; row: VaultItemRow }
  | { table: 'quests'; row: QuestRow }
  | { table: 'inbox'; row: InboxRow }

export class CaptureError extends Error {}

/** Turns a capture into the row to save. Ids are made on the device so offline saves sync without duplicates. */
export function buildCaptureRecord(input: CaptureInput, userId: string, newId: () => string = () => crypto.randomUUID()): CaptureRecord {
  const text = input.text.trim()
  if (!text) throw new CaptureError('empty')
  const notes = input.notes?.trim() || null
  const base = { id: newId(), user_id: userId, deleted_at: null }

  switch (input.destination) {
    case 'task':
      return {
        table: 'tasks',
        row: {
          ...base,
          title: text,
          notes,
          due_date: input.dueDate || null,
          priority: input.priority ?? DEFAULT_TASK_PRIORITY,
          status: 'open',
          source: 'capture',
        },
      }
    case 'vault':
      if (!input.bucketId) throw new CaptureError('bucket')
      return { table: 'vault_items', row: { ...base, bucket_id: input.bucketId, title: text, notes } }
    case 'quest':
      return {
        table: 'quests',
        row: {
          ...base,
          title: text,
          details: notes,
          energy_level: input.energy ?? DEFAULT_QUEST_ENERGY,
          time_bucket: input.time ?? DEFAULT_QUEST_TIME,
          status: 'open',
          times_picked: 0,
        },
      }
    case 'later':
      return { table: 'inbox', row: { ...base, body: text } }
  }
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
