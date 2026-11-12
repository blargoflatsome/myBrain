// Random Quest (SPEC §5): random pick, skipping the last 3 picked, filtered by time and energy available.
import type { EnergyLevel, QuestRow, TaskRow, TimeBucket } from '@/sync/types'
import { tasksForDay, undatedTasks } from '@/tasks/rules'

export const ENERGY_LEVELS: EnergyLevel[] = ['ugh', 'fun', 'needs_setup', 'medicated'] // least to most
export const TIME_BUCKETS: TimeBucket[] = ['30m', '2h', 'half_day', 'full_day'] // shortest to longest
export const RECENT_PICKS = 3

const rankOrLast = <T,>(order: T[], value: T | null | undefined) => (value != null && order.includes(value) ? order.indexOf(value) : order.length)

/** The list of quests (SPEC §5 Random Quest): easiest first, then shortest, then by title; unset energy or time last. */
export function byEffort(a: QuestRow, b: QuestRow): number {
  return (
    rankOrLast(ENERGY_LEVELS, a.energy_level as EnergyLevel | null) - rankOrLast(ENERGY_LEVELS, b.energy_level as EnergyLevel | null) ||
    rankOrLast(TIME_BUCKETS, a.time_bucket as TimeBucket | null) - rankOrLast(TIME_BUCKETS, b.time_bucket as TimeBucket | null) ||
    a.title.localeCompare(b.title)
  )
}

export interface QuestFilter {
  /** How much energy I have; quests needing this much or less match. */
  energy?: EnergyLevel | null
  /** How much time I have; quests that fit in this or less match. */
  time?: TimeBucket | null
}

const rank = <T>(list: T[], value: T) => list.indexOf(value)

/** Open quests that fit the filter. Untagged quests match any filter. */
export function matchingQuests(quests: QuestRow[], filter: QuestFilter = {}): QuestRow[] {
  return quests.filter((q) => {
    if (q.deleted_at || q.status !== 'open') return false
    if (filter.energy && q.energy_level && rank(ENERGY_LEVELS, q.energy_level) > rank(ENERGY_LEVELS, filter.energy)) return false
    if (filter.time && q.time_bucket && rank(TIME_BUCKETS, q.time_bucket) > rank(TIME_BUCKETS, filter.time)) return false
    return true
  })
}

/** Ids of the last few quests picked, most recent first. */
export function recentlyPicked(quests: QuestRow[], count = RECENT_PICKS): Set<string> {
  return new Set(
    quests
      .filter((q) => q.last_picked_at)
      .sort((a, b) => b.last_picked_at!.localeCompare(a.last_picked_at!))
      .slice(0, count)
      .map((q) => q.id),
  )
}

/**
 * Pick a quest at random from the matches, skipping the recently picked ones. If every match is recent,
 * offer the least recently picked match rather than nothing. Returns null when nothing matches at all.
 */
export function pickQuest(quests: QuestRow[], filter: QuestFilter = {}, random: () => number = Math.random): QuestRow | null {
  const matches = matchingQuests(quests, filter)
  if (!matches.length) return null
  const recent = recentlyPicked(quests)
  const fresh = matches.filter((q) => !recent.has(q.id))
  if (fresh.length) return fresh[Math.floor(random() * fresh.length)]!
  return [...matches].sort((a, b) => (a.last_picked_at ?? '').localeCompare(b.last_picked_at ?? ''))[0]!
}

/** Record that a quest was offered. */
export function markPicked(quest: QuestRow, now: Date = new Date()): QuestRow {
  return { ...quest, last_picked_at: now.toISOString(), times_picked: (quest.times_picked ?? 0) + 1 }
}

export const acceptQuest = (q: QuestRow): QuestRow => ({ ...q, status: 'accepted' })
/** Done (SPEC §5 Random Quest): back to the list to be picked again, out of In progress; the store logs the completion. */
export const finishQuest = (q: QuestRow, now: Date = new Date()): QuestRow => ({ ...q, status: 'open', completed_at: now.toISOString() })

/** Tasks in the draw (SPEC §5 Random Quest): open tasks due today, carried-over ones too, and open Undated tasks. */
export function tasksInDraw(tasks: TaskRow[], today: string, timeZone: string): TaskRow[] {
  return [...tasksForDay(tasks, today, today, timeZone), ...undatedTasks(tasks)].filter((t) => t.status === 'open')
}

export type Picked = { kind: 'quest' | 'task'; id: string }

/**
 * A random pick from the matching quests and the tasks in the draw (tasks match any filter), skipping recent quests
 * and the tasks picked lately on the page (`recentTasks`, oldest first). If everything is recent, the least recently
 * picked quest, else the task picked longest ago. Null when there is nothing at all.
 */
export function pickFromDraw(
  quests: QuestRow[],
  tasks: TaskRow[],
  filter: QuestFilter = {},
  recentTasks: readonly string[] = [],
  random: () => number = Math.random,
): Picked | null {
  const recent = recentlyPicked(quests)
  const pool: Picked[] = [
    ...matchingQuests(quests, filter).filter((q) => !recent.has(q.id)).map((q) => ({ kind: 'quest' as const, id: q.id })),
    ...tasks.filter((t) => !recentTasks.includes(t.id)).map((t) => ({ kind: 'task' as const, id: t.id })),
  ]
  if (pool.length) return pool[Math.floor(random() * pool.length)]!
  const quest = pickQuest(quests, filter, random)
  if (quest) return { kind: 'quest', id: quest.id }
  const oldest = recentTasks.find((id) => tasks.some((t) => t.id === id))
  return oldest ? { kind: 'task', id: oldest } : null
}
