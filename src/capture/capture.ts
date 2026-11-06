// Quick capture (SPEC §5): one thought, filed as a task, vault item, quest, or saved to the inbox to decide later.
import type { InboxRow, QuestRow, TaskRow, VaultBucketRow, VaultItemRow } from '@/sync/types'

export type Destination = 'task' | 'vault' | 'quest' | 'later'

export interface CaptureInput {
  text: string
  destination: Destination
  /** Task only. Optional: blank means the Undated list. Format YYYY-MM-DD. */
  dueDate?: string | null
  /** Vault only. */
  bucketId?: string
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
  const base = { id: newId(), user_id: userId, deleted_at: null }

  switch (input.destination) {
    case 'task':
      return {
        table: 'tasks',
        row: { ...base, title: text, due_date: input.dueDate || null, status: 'open', source: 'capture' },
      }
    case 'vault':
      if (!input.bucketId) throw new CaptureError('bucket')
      return { table: 'vault_items', row: { ...base, bucket_id: input.bucketId, title: text } }
    case 'quest':
      return { table: 'quests', row: { ...base, title: text, status: 'open' } }
    case 'later':
      return { table: 'inbox', row: { ...base, body: text } }
  }
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
