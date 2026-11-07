// Post Its (SPEC §5 Quick capture and Dashboard): sticky notes for quick reminders and scratch ideas.
import type { PostItColor, PostItRow } from '@/sync/types'

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
