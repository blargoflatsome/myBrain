// Dashboard stats (SPEC §5 Dashboard): yesterday's summary and leftovers, days since your worst day and favorite buckets.
// journalStreaks is also used by Trophies.
import type { JournalEntryRow, JournalStats, TaskRow, VaultBucketRow, VaultItemRow } from '@/sync/types'
import { addDays, daysBetween } from '@/tasks/days'
import { live } from '@/sync/live'
import { wroteIn } from '@/journal/body'

// ---------- Journal ----------
/**
 * Days in a row with a journal entry I wrote (entries the app wrote for me, with no writing, don't count). The current
 * streak is still alive today if I wrote yesterday and haven't written yet today.
 */
export function journalStreaks(entries: JournalEntryRow[], today: string): { current: number; best: number } {
  const days = new Set(live(entries).filter((e) => wroteIn(e) && e.date <= today).map((e) => e.date))
  const sorted = [...days].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const d of sorted) {
    run = previous && daysBetween(previous, d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    previous = d
  }
  let current = 0
  let d = days.has(today) ? today : addDays(today, -1)
  while (days.has(d)) {
    current++
    d = addDays(d, -1)
  }
  return { current, best }
}

/**
 * "Days since your worst day" (SPEC §5 Dashboard): days in a row, up to today, answered Yes to "Was today better
 * than yesterday?". A No or a day with no answer resets it; today without an answer yet doesn't break it.
 */
export function daysSinceWorstDay(entries: JournalEntryRow[], today: string): number {
  const answers = new Map(live(entries).map((e) => [e.date, e.better_than_yesterday ?? null]))
  let d = answers.get(today) == null ? addDays(today, -1) : today
  let count = 0
  while (answers.get(d) === true) {
    count++
    d = addDays(d, -1)
  }
  return count
}

/** Starred Vault buckets, in bucket order, each with its 3 newest items (SPEC §5 The Vault). */
export function favoriteBuckets(buckets: VaultBucketRow[], items: VaultItemRow[]) {
  return live(buckets)
    .filter((b) => b.starred)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((bucket) => ({
      bucket,
      newest: live(items)
        .filter((i) => i.bucket_id === bucket.id)
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
        .slice(0, 3),
    }))
}

// ---------- Yesterday ----------
export interface YesterdaySummary {
  habits: { kept: number; scheduled: number }
  tasks: { done: number; due: number }
  routines: { finished: number; total: number; list: { id: string; title: string; done: number; total: number }[] }
  /** Titles of quests done yesterday (one per time done). */
  quests: string[]
  /** Nothing was scheduled, due or done yesterday. */
  empty: boolean
}

/**
 * SPEC §5 Dashboard "How past you did yesterday": yesterday's habits, tasks and routines, from the
 * same day stats the Journal records. A routine counts as finished when every step was done.
 */
export function yesterdaySummary(stats: JournalStats): YesterdaySummary {
  const list = stats.routines.filter((r) => r.total > 0)
  return {
    habits: { ...stats.habits },
    tasks: { ...stats.tasks },
    routines: { finished: list.filter((r) => r.done >= r.total).length, total: list.length, list },
    // Quests done yesterday (SPEC §5 Dashboard); quests aren't scheduled, so it's a count with their names.
    quests: [...stats.quests],
    empty: !stats.habits.scheduled && !stats.tasks.due && !list.length && !stats.quests.length,
  }
}

/** Yesterday's leftovers (SPEC §5 Dashboard): tasks due yesterday that are still open, in the Tasks page order. */
export function yesterdayLeftovers(tasks: TaskRow[], today: string): TaskRow[] {
  const yesterday = addDays(today, -1)
  return live(tasks)
    .filter((t) => t.status === 'open' && t.due_date === yesterday)
    .sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))
}
