// SPEC §5 Celebrations: the data store says when I finished something; the celebration layer decides how to
// celebrate. Kept apart so the store stays free of screen code (and unit tests run with nobody listening).
import type { HabitRow, TaskRow } from '@/sync/types'

export type Achievement =
  | { kind: 'task'; task: TaskRow }
  | { kind: 'habit'; habit: HabitRow }
  | { kind: 'step'; finished: boolean }
  | { kind: 'capture'; table: string }
  | { kind: 'journal' }
  | { kind: 'quest' }
  | { kind: 'vault' }
  | { kind: 'postit' }
  | { kind: 'orphan' }
  | { kind: 'shared_event' }
  | { kind: 'focus'; sessions: number }

type Listener = (a: Achievement) => void
const listeners = new Set<Listener>()

/** Listen for finished things; returns a function that stops listening. */
export function onAchievement(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Say that something was just finished. A listener that fails never breaks the save that called this. */
export function achieved(a: Achievement) {
  for (const fn of listeners) {
    try {
      fn(a)
    } catch (err) {
      console.error(err)
    }
  }
}
