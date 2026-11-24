// SPEC §5 Celebrations: actions say when I finished something (after saving it, and its activity row). The trophy
// keeper (src/trophies/keeper.ts) listens to earn Firsts and trophy levels and says what it earned; the celebration
// layer listens to all of it and only decides how to celebrate. Only actions say things here, never screens (lint).
import type { HabitRow, TaskRow } from '@/sync/types'
import type { BadgeKind } from '@/celebrate/rules'

export type Achievement =
  | { kind: 'task'; task: TaskRow }
  | { kind: 'habit'; habit: HabitRow }
  | { kind: 'step'; finished: boolean }
  | { kind: 'capture'; table: string }
  | { kind: 'journal' }
  | { kind: 'quest'; energy?: string | null }
  | { kind: 'vault' }
  | { kind: 'postit' }
  | { kind: 'orphan' }
  | { kind: 'shared_event' }
  | { kind: 'focus'; sessions: number; together?: boolean }
  | { kind: 'breathe' }
  | { kind: 'cheer_post' }
  | { kind: 'cheer' }
  /** The keeper earned a First just now (Firsts found in my history are saved quietly and never said). */
  | { kind: 'first'; badge: BadgeKind }
  /** The keeper raised a trophy to a new level (the first time on a device they go in quietly, with one alert). */
  | { kind: 'trophy'; id: string; level: number }

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
