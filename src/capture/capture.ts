// Quick capture (SPEC §5): one thought, filed as a task, vault item, quest, habit, or saved to Orphans to decide later.
import type { EnergyLevel, InboxRow, PostItColor, TimeBucket, VaultBucketRow } from '@/sync/types'
import { toEditorHtml } from '@/journal/body'
import { TITLE_MAX } from '@/lib/titles'

export type Destination = 'task' | 'vault' | 'quest' | 'habit' | 'postit' | 'later'

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
  /** Task only: 'HH:MM', kept only for a High task with a date (SPEC §5 High-priority tasks). */
  reminderTime?: string | null
  /** Vault only. */
  bucketId?: string
  /** Vault only, optional (SPEC §5 Forms: the same form as the item editor). */
  rating?: number | null
  link?: string | null
  /** Quest only. Default Ugh. */
  energy?: EnergyLevel
  /** Quest only. Default 30 min. */
  time?: TimeBucket
  /** Post It only: its color (yellow when not given). Its text is the formatted note. */
  color?: PostItColor
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

/** Where a capture was filed: the new item's table and id. */
export interface Captured {
  table: 'tasks' | 'vault_items' | 'quests' | 'habits' | 'post_its' | 'inbox'
  id: string
}

/** Why a capture wasn't saved: no words, no bucket chosen, or a reminder that has already gone. */
export type CaptureProblem = 'empty' | 'bucket' | 'reminder'

export class CaptureError extends Error {
  constructor(readonly reason: CaptureProblem | 'bucket-name') {
    super(reason)
  }
}

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

/** Reads the text shared into the app (Web Share Target, SPEC §3) from the capture URL's query. */
export function sharedText(query: Record<string, unknown>): string {
  const parts = ['title', 'text', 'url']
    .map((k) => (typeof query[k] === 'string' ? (query[k] as string).trim() : ''))
    .filter(Boolean)
  return [...new Set(parts)].join('\n')
}
