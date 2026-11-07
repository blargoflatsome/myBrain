// Post Its (SPEC §5 Quick capture and Dashboard): sticky notes for quick reminders and scratch ideas.
import type { PostItColor, PostItRow } from '@/sync/types'
import { toEditorHtml } from '@/journal/body'

export const POST_IT_COLORS: PostItColor[] = ['yellow', 'pink', 'blue', 'green']
export const DEFAULT_POST_IT_COLOR: PostItColor = 'yellow'

/** Notes to show, front first: by position, then newest. Removed notes are left out. */
export function boardOrder(notes: PostItRow[]): PostItRow[] {
  return notes
    .filter((n) => !n.deleted_at)
    .sort((a, b) => a.position - b.position || (b.created_at ?? '').localeCompare(a.created_at ?? ''))
}

/** Where a new note goes: in front of every other note. */
export function frontPosition(notes: PostItRow[]): number {
  const live = notes.filter((n) => !n.deleted_at)
  return live.length ? Math.min(...live.map((n) => n.position)) - 1 : 0
}

/** The note's lines as plain text (one per paragraph, heading, list item or line break). */
export function noteLines(html: string): string[] {
  const doc = new DOMParser().parseFromString(toEditorHtml(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html')
  const blocks = doc.body.querySelectorAll('p, h2, h3, li, blockquote')
  const lines = blocks.length ? [...blocks].filter((b) => !b.querySelector('p, li')).map((b) => b.textContent ?? '') : [doc.body.textContent ?? '']
  return lines
    .flatMap((l) => l.split('\n'))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** "Make a task": the first line becomes the title, the rest the notes. */
export function noteToTask(html: string): { title: string; notes: string | null } | null {
  const lines = noteLines(html)
  if (!lines.length) return null
  const [first, ...rest] = lines
  const title = first!.length > 200 ? `${first!.slice(0, 199)}…` : first!
  const notes = [first!.length > 200 ? first : null, ...rest].filter(Boolean).join('\n')
  return { title, notes: notes || null }
}
