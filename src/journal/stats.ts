// Journal rules (SPEC §5 Journal): the day's stats, missed days written on my behalf, and when stats freeze.
import type {
  HabitLogRow,
  HabitRow,
  JournalEntryRow,
  JournalStats,
  PriorityTaskLogRow,
  PriorityTaskRow,
  QuestRow,
  RoutineRow,
  RoutineRunRow,
  RoutineStepLogRow,
  RoutineStepRow,
  TaskRow,
} from '@/sync/types'
import { dayStatus, isScheduled as habitScheduled, streaks, zonedTime } from '@/habits/rules'
import { activeSteps, isScheduled as routineScheduled, runFor } from '@/routines/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { addDays, todayIn } from '@/tasks/days'

export interface DayData {
  tasks: TaskRow[]
  habits: HabitRow[]
  habitLogs: HabitLogRow[]
  routines: RoutineRow[]
  routineSteps: RoutineStepRow[]
  routineRuns: RoutineRunRow[]
  routineStepLogs: RoutineStepLogRow[]
  priorityTasks: PriorityTaskRow[]
  priorityTaskLogs: PriorityTaskLogRow[]
  quests: QuestRow[]
}

const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => !r.deleted_at)
const localDay = (iso: string, timeZone: string) => todayIn(timeZone, new Date(iso))

/** A streak counts as reached from 2 days in a row; a reset is only noted when there was a streak to lose. */
export const STREAK_MIN = 2

/**
 * The stats for one day (SPEC §5 Journal). `now` decides what is still open: for today, habits whose deadline has
 * not passed are neither kept nor missed yet; for a past day, `now` is any moment after it ended.
 */
export function dayStats(data: DayData, date: string, now: Date, timeZone: string): JournalStats {
  // Tasks: due that day, plus any finished that day; done = finished on that day.
  const tasks = live(data.tasks).filter((t) => t.status !== 'cancelled')
  const doneDay = (t: TaskRow) => {
    if (t.status !== 'done' || !t.completed_at) return null
    const d = localDay(t.completed_at, timeZone)
    return t.due_date && t.due_date > d ? t.due_date : d
  }
  const counted = tasks.filter((t) => t.due_date === date || doneDay(t) === date)
  const taskStats = { done: counted.filter((t) => doneDay(t) === date).length, due: counted.length }

  // Habits and streaks are judged as of just after the day ended (so its deadlines have passed), or now if earlier.
  const afterDay = zonedTime(addDays(date, 1), '00:00', timeZone) + 1
  const asOf = new Date(Math.min(now.getTime(), afterDay))
  // Just after the day began: that day is still open, so the streak counted is the one carried into the day.
  const dayStart = new Date(zonedTime(date, '00:00', timeZone) + 1)

  const habits = live(data.habits).filter((h) => habitScheduled(h, date))
  let kept = 0
  const streakNotes: JournalStats['streaks'] = []
  const priority: JournalStats['priority'] = []
  for (const h of habits) {
    const logs = data.habitLogs.filter((l) => l.habit_id === h.id)
    const status = dayStatus(h, date, logs, asOf, timeZone)
    if (status === 'completed') kept++
    if (h.is_priority) priority.push({ title: h.title, done: status === 'completed' })
    if (status === 'completed') {
      const { current } = streaks(h, logs, asOf, timeZone)
      if (current >= STREAK_MIN) streakNotes.push({ title: h.title, kind: 'reached', days: current })
    } else if (status === 'missed' && date > h.start_date) {
      const before = streaks(h, logs, dayStart, timeZone).current
      if (before >= STREAK_MIN) streakNotes.push({ title: h.title, kind: 'reset', days: before })
    }
  }

  const routines = live(data.routines)
    .filter((r) => routineScheduled(r, date))
    .map((r) => {
      const steps = activeSteps(data.routineSteps, r.id)
      const run = runFor(data.routineRuns, r.id, date)
      const done = run ? live(data.routineStepLogs).filter((l) => l.run_id === run.id && l.status === 'completed').length : 0
      return { id: r.id, title: r.title, done: Math.min(done, steps.length), total: steps.length }
    })

  for (const t of live(data.priorityTasks).filter((t) => isTaskScheduled(t, date))) {
    priority.push({ title: t.title, done: live(data.priorityTaskLogs).some((l) => l.task_id === t.id && l.date === date) })
  }

  const quests = live(data.quests)
    .filter((q) => q.status === 'done' && q.completed_at && localDay(q.completed_at, timeZone) === date)
    .map((q) => q.title)

  return { tasks: taskStats, habits: { kept, scheduled: habits.length }, routines, priority, streaks: streakNotes, quests }
}

/** The same id for a day's entry on every device, so two devices writing it update one row (SPEC §7). */
export function entryIdFor(userId: string, date: string): string {
  return `${userId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}

export function emptyEntry(userId: string, date: string, auto: boolean): JournalEntryRow {
  return { id: entryIdFor(userId, date), user_id: userId, date, body: '', stats: {}, stats_final: false, auto, deleted_at: null }
}

/**
 * Days that ended without an entry: each gets an entry written on my behalf (SPEC §5 Journal). Counted from my first
 * entry, so nothing is invented for days before I started journaling. With no entries yet, today starts the journal
 * (an empty entry for today, not marked as written by the app). Today itself is never "missed": it is still open.
 */
export function missingDays(entries: JournalEntryRow[], today: string): string[] {
  const have = new Set(live(entries).map((e) => e.date))
  if (!have.size) return [today]
  const first = [...have].sort()[0]!
  const days: string[] = []
  for (let d = first; d < today; d = addDays(d, 1)) if (!have.has(d)) days.push(d)
  return days
}

/** Stats stay live while the day is open, and freeze once it has ended. Frozen stats never change. */
export function statsUpdate(entry: JournalEntryRow, stats: JournalStats, today: string): Partial<JournalEntryRow> | null {
  if (entry.stats_final) return null
  const final = entry.date < today
  if (!final && JSON.stringify(entry.stats) === JSON.stringify(stats)) return null
  return final ? { stats, stats_final: true } : { stats }
}

export function hasStats(stats: JournalEntryRow['stats']): stats is JournalStats {
  return 'tasks' in stats
}
