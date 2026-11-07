// Dashboard stats (SPEC §5 Dashboard): habits, journal, events, tasks, routines and quests, over a chosen period.
import type {
  EventInviteRow,
  EventRow,
  HabitLogRow,
  HabitRow,
  JournalEntryRow,
  QuestRow,
  RoutineRow,
  RoutineRunRow,
  RoutineStepLogRow,
  RoutineStepRow,
  TaskRow,
} from '@/sync/types'
import { dayStatus, isScheduled as habitScheduled, streaks, zonedTime } from '@/habits/rules'
import { isAnytime, routineStats } from '@/routines/rules'
import { occursOn } from '@/events/rules'
import { addDays, daysBetween, todayIn } from '@/tasks/days'

export type Period = 'year' | '12months' | 'all'
export const PERIODS: Period[] = ['year', '12months', 'all']

/** The first day counted for a period ("This year" starts January 1; "All time" has no start). */
export function periodStart(period: Period, today: string): string | null {
  if (period === 'year') return `${today.slice(0, 4)}-01-01`
  if (period === '12months') return addDays(`${Number(today.slice(0, 4)) - 1}${today.slice(4)}`, 1)
  return null
}

const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)
const inPeriod = (date: string | null | undefined, from: string | null, today: string) => !!date && (!from || date >= from) && date <= today
const localDay = (iso: string, timeZone: string) => todayIn(timeZone, new Date(iso))

// ---------- Habits ----------
export interface HabitStreakRow {
  habit: HabitRow
  current: number
  best: number
}
export interface HabitStats {
  rows: HabitStreakRow[]
  /** Top 3 habits by missed days in the period (only habits with at least one miss). */
  mostMissed: { habit: HabitRow; missed: number }[]
  longestCurrent: HabitStreakRow | null
  bestEver: HabitStreakRow | null
  oldest: HabitRow | null
}

export function habitStats(habits: HabitRow[], logs: HabitLogRow[], now: Date, timeZone: string, from: string | null): HabitStats {
  const today = todayIn(timeZone, now)
  const list = live(habits)
  const rows = list
    .map((habit) => ({ habit, ...streaks(habit, logs.filter((l) => l.habit_id === habit.id), now, timeZone) }))
    .sort((a, b) => b.current - a.current || b.best - a.best || a.habit.title.localeCompare(b.habit.title))
  const mostMissed = list
    .map((habit) => {
      const mine = logs.filter((l) => l.habit_id === habit.id)
      let missed = 0
      const start = from && from > habit.start_date ? from : habit.start_date
      for (let d = start; d <= today; d = addDays(d, 1)) {
        if (habitScheduled(habit, d) && dayStatus(habit, d, mine, now, timeZone) === 'missed') missed++
      }
      return { habit, missed }
    })
    .filter((x) => x.missed > 0)
    .sort((a, b) => b.missed - a.missed || a.habit.title.localeCompare(b.habit.title))
    .slice(0, 3)
  const top = (score: (r: HabitStreakRow) => number) =>
    rows.filter((r) => score(r) > 0).sort((a, b) => score(b) - score(a) || a.habit.title.localeCompare(b.habit.title))[0] ?? null
  const oldest = [...list].sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.created_at ?? '').localeCompare(b.created_at ?? ''))[0] ?? null
  return { rows, mostMissed, longestCurrent: top((r) => r.current), bestEver: top((r) => r.best), oldest }
}

// ---------- Journal ----------
/**
 * Days in a row with a journal entry I wrote (entries the app wrote for me, with no writing, don't count). The current
 * streak is still alive today if I wrote yesterday and haven't written yet today.
 */
export function journalStreaks(entries: JournalEntryRow[], today: string): { current: number; best: number } {
  const days = new Set(live(entries).filter((e) => e.body.trim() && e.date <= today).map((e) => e.date))
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

// ---------- Events ----------
export interface EventStats {
  created: number
  attended: number
  cancelled: number
}

/**
 * Events in the period (SPEC §5 Dashboard): created = my events made in the period; attended = dates that have
 * passed of my own events and of invited events I said Yes to, not counting cancelled ones (a timed event once it
 * has ended, an all-day event once its day is over); cancelled = events I cancelled for everyone, dropped out of,
 * or deleted, in the period.
 */
export function eventStats(
  events: EventRow[],
  from: string | null,
  now: Date,
  timeZone: string,
  invites: EventInviteRow[] = [],
  me: string | null = null,
): EventStats {
  const today = todayIn(timeZone, now)
  const isMine = (e: EventRow) => !me || !e.user_id || e.user_id === me
  const goingTo = new Set(invites.filter((i) => !i.deleted_at && i.response === 'yes').map((i) => i.event_id))
  let attended = 0
  for (const e of live(events).filter((x) => !x.cancelled_at && (isMine(x) || goingTo.has(x.id)))) {
    const length = daysBetween(e.start_date, e.end_date)
    const first = from && from > e.start_date ? from : e.start_date
    for (let d = first; d <= today; d = addDays(d, 1)) {
      if (!occursOn(e, d)) continue
      const endDate = addDays(d, length)
      const ended = e.end_time ? now.getTime() >= zonedTime(endDate, e.end_time, timeZone) : endDate < today
      if (ended) attended++
    }
  }
  const mine = events.filter(isMine)
  const cancelledByMe = mine.filter((e) => {
    const when = e.cancelled_at ?? e.deleted_at
    return !!when && inPeriod(localDay(when, timeZone), from, today)
  }).length
  const droppedOut = invites.filter((i) => i.response === 'dropped' && i.responded_at && inPeriod(localDay(i.responded_at, timeZone), from, today)).length
  return {
    created: mine.filter((e) => e.created_at && inPeriod(localDay(e.created_at, timeZone), from, today)).length,
    attended,
    cancelled: cancelledByMe + droppedOut,
  }
}

// ---------- Tasks, routines, quests ----------
export function tasksDone(tasks: TaskRow[], from: string | null, now: Date, timeZone: string): number {
  const today = todayIn(timeZone, now)
  return live(tasks).filter((t) => t.status === 'done' && t.completed_at && inPeriod(localDay(t.completed_at, timeZone), from, today)).length
}

export function questsFinished(quests: QuestRow[], from: string | null, now: Date, timeZone: string): number {
  const today = todayIn(timeZone, now)
  return live(quests).filter((q) => q.status === 'done' && q.completed_at && inPeriod(localDay(q.completed_at, timeZone), from, today)).length
}

export interface RoutineSummary {
  routine: RoutineRow
  anytime: boolean
  /** Days completed (scheduled) or times finished (run anytime). */
  completed: number
  /** Scheduled days that counted (0 for run anytime). */
  possible: number
}

/** Each routine's completion in the period: a rate for scheduled routines, times finished for run-anytime ones. */
export function routineSummaries(
  routines: RoutineRow[],
  steps: RoutineStepRow[],
  runs: RoutineRunRow[],
  logs: RoutineStepLogRow[],
  habits: HabitRow[],
  from: string | null,
  now: Date,
  timeZone: string,
): RoutineSummary[] {
  const today = todayIn(timeZone, now)
  return live(routines).map((routine) => {
    if (isAnytime(routine)) {
      const completed = runs.filter((r) => r.routine_id === routine.id && !r.deleted_at && r.finished_at && inPeriod(localDay(r.finished_at, timeZone), from, today)).length
      return { routine, anytime: true, completed, possible: 0 }
    }
    // Count only from the period's start: treat the routine as starting then if it began earlier.
    const counted = from && from > routine.start_date ? { ...routine, start_date: from } : routine
    const stats = routineStats(counted, steps, runs, logs, today, habits)
    return { routine, anytime: false, completed: stats.completed, possible: stats.possible }
  })
}
