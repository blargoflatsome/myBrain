// Journal rules (SPEC §5 Journal): the day's stats, missed days written on my behalf, and when stats freeze.
import type { HabitLogRow, HabitRow, JournalEntryRow, JournalStats, PriorityTaskLogRow, PriorityTaskRow, QuestLogRow, QuestRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow, TaskRow } from '@/sync/types'
import { dayStatus, isScheduled as habitScheduled, streaks, zonedTime } from '@/habits/rules'
import { activeSteps, isAnytime, isScheduled as routineScheduled, runFor, stepsForDay } from '@/routines/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { addDays, dayOf } from '@/tasks/days'
import { live } from '@/sync/live'

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
  questLogs: QuestLogRow[]
}


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
    const d = dayOf(t.completed_at, timeZone)
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

  // Scheduled routines that day (habit steps only on days their habit is scheduled), plus run-anytime routines I
  // made progress on that day (steps completed that day).
  const stepLogs = live(data.routineStepLogs)
  const routines = live(data.routines)
    .map((r) => {
      const steps = stepsForDay(activeSteps(data.routineSteps, r.id), data.habits, date)
      if (isAnytime(r)) {
        const runIds = new Set(data.routineRuns.filter((x) => x.routine_id === r.id && !x.deleted_at).map((x) => x.id))
        const done = stepLogs.filter((l) => runIds.has(l.run_id) && l.status === 'completed' && dayOf(l.logged_at, timeZone) === date).length
        return done ? { id: r.id, title: r.title, done: Math.min(done, steps.length), total: steps.length } : null
      }
      if (!routineScheduled(r, date)) return null
      const run = runFor(data.routineRuns, r.id, date)
      const ids = new Set(steps.map((x) => x.id))
      const done = run ? stepLogs.filter((l) => l.run_id === run.id && l.status === 'completed' && ids.has(l.step_id)).length : 0
      return { id: r.id, title: r.title, done: Math.min(done, steps.length), total: steps.length }
    })
    .filter((r): r is JournalStats['routines'][number] => !!r)

  for (const t of live(data.priorityTasks).filter((t) => isTaskScheduled(t, date))) {
    priority.push({ title: t.title, done: live(data.priorityTaskLogs).some((l) => l.task_id === t.id && l.date === date) })
  }

  const titles = new Map(data.quests.map((q) => [q.id, q.title]))
  const quests = live(data.questLogs)
    .filter((l) => l.date === date && titles.has(l.quest_id))
    .map((l) => titles.get(l.quest_id)!)

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
 * Days that ended without an entry: each is a candidate for an entry written on my behalf (SPEC §5 Journal), kept
 * only if I did something that day (see hadActivity). Counted from when I started journaling (my first entry, or the
 * day this device first opened the journal), so nothing is invented for earlier days. Today is never "missed".
 */
export function missingDays(entries: JournalEntryRow[], today: string, start: string): string[] {
  const have = new Set(live(entries).map((e) => e.date))
  const first = [start, ...have].sort()[0]!
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

/**
 * Whether I did something that day: completed a task, habit, routine step, priority item or quest. A day that ended
 * with no activity gets no entry written on my behalf (SPEC §5 Journal).
 */
export function hadActivity(stats: JournalStats): boolean {
  return (
    stats.tasks.done > 0 ||
    stats.habits.kept > 0 ||
    stats.routines.some((r) => r.done > 0) ||
    stats.priority.some((p) => p.done) ||
    stats.quests.length > 0
  )
}
