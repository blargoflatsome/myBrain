// SPEC §5 Trophies: what my history says about each trophy. Pure functions over the rows on this device, so the
// same history always gives the same trophies, on every device, and new trophies count what I already did.
import type {
  ActivityLogRow,
  BadgeRow,
  EventInviteRow,
  EventRow,
  HabitLogRow,
  HabitRow,
  JournalEntryRow,
  PriorityTaskLogRow,
  PriorityTaskRow,
  QuestLogRow,
  QuestRow,
  RoutineRunRow,
  RoutineRow,
  TaskRow,
  VaultBucketRow,
  VaultItemRow,
} from '@/sync/types'
import { isScheduled as habitScheduled } from '@/habits/rules'
import { isScheduled as routineScheduled } from '@/routines/rules'
import { isTaskScheduled } from '@/reminders/priority'
import { journalStreaks } from '@/dashboard/stats'
import { perfectDays } from '@/celebrate/rules'
import { plainText } from '@/journal/body'
import { addDays, daysBetween, todayIn } from '@/tasks/days'
import { live } from '@/sync/live'
import { levelFor, TROPHIES, type Trophy, type TrophyId } from '@/trophies/definitions'

export interface TrophyHistory {
  tasks: TaskRow[]
  habits: HabitRow[]
  habitLogs: HabitLogRow[]
  routines: RoutineRow[]
  routineRuns: RoutineRunRow[]
  journalEntries: JournalEntryRow[]
  quests: QuestRow[]
  questLogs: QuestLogRow[]
  vaultItems: VaultItemRow[]
  vaultBuckets: VaultBucketRow[]
  priorityTasks: PriorityTaskRow[]
  priorityLogs: PriorityTaskLogRow[]
  events: EventRow[]
  invites: EventInviteRow[]
  activity: ActivityLogRow[]
  userId: string
  /** When my account was made (ISO). */
  accountCreated: string | null
  /** From the server; null when it couldn't be asked (offline): those trophies just wait. */
  connections: number | null
  blocks: number | null
}

/** The local day and time of a moment, in my time zone. */
export function localMoment(iso: string, timeZone: string): { date: string; hour: number; minute: number } {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(d)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return { date: todayIn(timeZone, d), hour: get('hour') % 24, minute: get('minute') }
}

/** The longest run of `true` over a list of days in order. */
function bestRun(flags: boolean[]): number {
  let best = 0
  let run = 0
  for (const f of flags) {
    run = f ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/** The most of anything on one key (a day or a month). */
function mostOnOneKey(keys: string[]): number {
  const counts = new Map<string, number>()
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1)
  return Math.max(0, ...counts.values())
}

function written(entries: JournalEntryRow[]): JournalEntryRow[] {
  return live(entries).filter((e) => !e.auto && plainText(e.body).trim())
}

/** Each habit's best streak, over its scheduled days (a completed day adds one; a day not done breaks it). */
function bestHabitStreak(habit: HabitRow, done: Set<string>, today: string): number {
  const flags: boolean[] = []
  for (let d = habit.start_date; d < today || (d === today && done.has(`${habit.id}|${d}`)); d = addDays(d, 1)) {
    if (habitScheduled(habit, d)) flags.push(done.has(`${habit.id}|${d}`))
  }
  return bestRun(flags)
}

function completedSet(logs: HabitLogRow[]): Set<string> {
  return new Set(live(logs).filter((l) => l.status === 'completed').map((l) => `${l.habit_id}|${l.date}`))
}

/** Days that had at least one habit scheduled, and whether every one was done. Today counts once it's perfect. */
function perfectFlags(habits: HabitRow[], done: Set<string>, from: string, to: string, today: string): { date: string; perfect: boolean }[] {
  const out: { date: string; perfect: boolean }[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const scheduled = habits.filter((h) => habitScheduled(h, d))
    if (!scheduled.length) continue
    const perfect = scheduled.every((h) => done.has(`${h.id}|${d}`))
    if (d === today && !perfect) continue // today isn't over: not done yet doesn't break anything
    out.push({ date: d, perfect })
  }
  return out
}

/** Whether every scheduled habit was done on every day from `from` to `to` (a period that has ended, or ends today). */
function perfectPeriod(habits: HabitRow[], done: Set<string>, from: string, to: string, today: string): boolean {
  if (to > today) return false
  const days = perfectFlags(habits, done, from, to, today)
  return days.length > 0 && days.every((d) => d.perfect) && (to < today || days.some((d) => d.date === today))
}

const monthEnd = (month: string) => addDays(`${addMonth(month)}-01`, -1)
function addMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y! + 1}-01` : `${y}-${String(m! + 1).padStart(2, '0')}`
}

/** Every value the trophies are measured by (SPEC §5 Trophies). */
export function trophyValues(h: TrophyHistory, now: Date, timeZone: string): Record<TrophyId, number> {
  const today = todayIn(timeZone, now)
  const habits = live(h.habits)
  const done = completedSet(h.habitLogs)
  const tasks = live(h.tasks)
  const doneTasks = tasks.filter((t) => t.status === 'done' && t.completed_at)
  const entries = written(h.journalEntries)
  const firstHabit = habits.map((x) => x.start_date).sort()[0]
  const activity = live(h.activity)
  const focus = activity.filter((a) => a.kind === 'focus')
  const captures = activity.filter((a) => a.kind === 'capture')
  const v: Record<TrophyId, number> = {}

  // Streaks
  v.habit_streak = Math.max(0, ...habits.map((x) => bestHabitStreak(x, done, today)))
  v.journal_streak = journalStreaks(entries, today).best
  v.routine_streak = Math.max(
    0,
    ...live(h.routines)
      .filter((r) => r.weekdays)
      .map((r) => {
        const finished = new Set(live(h.routineRuns).filter((run) => run.routine_id === r.id && run.finished_at).map((run) => run.date))
        const flags: boolean[] = []
        for (let d = r.start_date; d <= today; d = addDays(d, 1)) {
          if (!routineScheduled(r, d) || (d === today && !finished.has(d))) continue
          flags.push(finished.has(d))
        }
        return bestRun(flags)
      }),
  )
  v.perfect_streak = firstHabit ? bestRun(perfectFlags(habits, done, firstHabit, today, today).map((d) => d.perfect)) : 0
  const answers = new Map(live(h.journalEntries).map((e) => [e.date, e.better_than_yesterday ?? null]))
  const answered = [...answers.keys()].sort()
  const goodFlags: boolean[] = []
  if (answered.length) for (let d = answered[0]!; d <= today; d = addDays(d, 1)) if (!(d === today && answers.get(d) == null)) goodFlags.push(answers.get(d) === true)
  v.good_days = bestRun(goodFlags)

  // Totals
  v.tasks_created = h.tasks.length
  v.tasks_completed = doneTasks.length
  v.habits_created = h.habits.length
  v.habit_checkins = done.size
  v.journal_entries = entries.length
  v.routines_finished = live(h.routineRuns).filter((r) => r.finished_at).length
  v.quests_finished = live(h.questLogs).length
  v.vault_items = h.vaultItems.length

  // Brain dumps
  v.brain_dump = mostOnOneKey(captures.map((a) => localMoment(a.at, timeZone).date))
  v.orphan_wrangler = activity.filter((a) => a.kind === 'orphans_cleared').length
  v.tried_everything = new Set(captures.map((a) => a.detail?.type).filter(Boolean)).size

  // Focus
  const focusDays = focus.map((a) => localMoment(a.at, timeZone).date)
  v.full_cycle = mostOnOneKey(focusDays)
  v.focus_days = new Set(focusDays).size
  v.focus_hours = Math.floor(focus.reduce((sum, a) => sum + (a.detail?.minutes ?? 0), 0) / 60)

  // Perfect days, weeks, months and years
  v.perfect_days = perfectDays(habits, live(h.habitLogs), today)
  v.perfect_week = 0
  v.perfect_month = 0
  v.perfect_year = 0
  if (firstHabit) {
    // Weeks run Sunday to Saturday, like the calendar.
    let sunday = addDays(firstHabit, -new Date(`${firstHabit}T00:00:00Z`).getUTCDay())
    for (; sunday <= today && !v.perfect_week; sunday = addDays(sunday, 7)) if (perfectPeriod(habits, done, sunday, addDays(sunday, 6), today)) v.perfect_week = 1
    for (let month = firstHabit.slice(0, 7); `${month}-01` <= today && !v.perfect_month; month = addMonth(month)) {
      if (perfectPeriod(habits, done, `${month}-01`, monthEnd(month), today)) v.perfect_month = 1
    }
    for (let year = Number(firstHabit.slice(0, 4)); `${year}-01-01` <= today && !v.perfect_year; year++) {
      if (perfectPeriod(habits, done, `${year}-01-01`, `${year}-12-31`, today)) v.perfect_year = 1
    }
  }

  // Quests
  const questById = new Map(h.quests.map((q) => [q.id, q]))
  const questLogs = live(h.questLogs)
  v.every_energy = new Set(questLogs.map((l) => questById.get(l.quest_id)?.energy_level).filter(Boolean)).size
  v.quest_month = mostOnOneKey(questLogs.map((l) => l.date.slice(0, 7)))

  // Taking care of myself: priority reminders done on their day, in a row; a whole month of a priority habit.
  const taskLogDays = new Set(live(h.priorityLogs).map((l) => `${l.task_id}|${l.date}`))
  const priorityRuns = live(h.priorityTasks).map((p) => {
    const flags: boolean[] = []
    const from = p.due_date ?? p.start_date
    for (let d = from; d <= today; d = addDays(d, 1)) {
      if (!isTaskScheduled(p, d) || (d === today && !taskLogDays.has(`${p.id}|${d}`))) continue
      flags.push(taskLogDays.has(`${p.id}|${d}`))
      if (p.due_date) break
    }
    return bestRun(flags)
  })
  const priorityHabits = habits.filter((x) => x.is_priority)
  v.on_it = Math.max(0, ...priorityRuns, ...priorityHabits.map((x) => bestHabitStreak(x, done, today)))
  v.care_month = 0
  for (const x of priorityHabits) {
    for (let month = x.start_date.slice(0, 7); monthEnd(month) <= today && !v.care_month; month = addMonth(month)) {
      if (`${month}-01` < x.start_date) continue // a full month: it had started by the 1st
      let scheduled = 0
      let all = true
      for (let d = `${month}-01`; d <= monthEnd(month); d = addDays(d, 1)) {
        if (!habitScheduled(x, d)) continue
        scheduled++
        if (!done.has(`${x.id}|${d}`)) all = false
      }
      if (scheduled && all) v.care_month = 1
    }
  }

  // Reflection
  v.words_written = entries.reduce((sum, e) => sum + plainText(e.body).trim().split(/\s+/).filter(Boolean).length, 0)

  // Time of day (early bird is 4 to 7 am, so staying up all night never earns it)
  const doneMoments = [
    ...doneTasks.map((t) => t.completed_at!),
    ...live(h.habitLogs).filter((l) => l.status === 'completed' && l.completed_at).map((l) => l.completed_at!),
  ].map((iso) => localMoment(iso, timeZone))
  v.early_bird = doneMoments.some((m) => m.hour >= 4 && m.hour < 7) ? 1 : 0
  const taskDays = new Set(doneTasks.map((t) => localMoment(t.completed_at!, timeZone).date))
  v.weekend_warrior = [...taskDays].some((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 6 && taskDays.has(addDays(d, 1))) ? 1 : 0
  const mondays = new Map<string, TaskRow[]>()
  for (const task of tasks) {
    if (task.due_date && task.due_date <= today && task.status !== 'cancelled' && new Date(`${task.due_date}T00:00:00Z`).getUTCDay() === 1) {
      mondays.set(task.due_date, [...(mondays.get(task.due_date) ?? []), task])
    }
  }
  v.monday_handled = [...mondays.values()].some((list) => list.every((task) => task.status === 'done')) ? 1 : 0

  // Getting organized (the starter buckets count too)
  v.organized = h.vaultBuckets.length

  // Events: 4 or more in a calendar month (mine, or said Yes to), none cancelled, once the month is over.
  // Events I host are mine; an invite row for someone else's event is my own invitation.
  const mine = h.events.filter((e) => e.user_id === h.userId)
  const mineIds = new Set(mine.map((e) => e.id))
  const byMonth = new Map<string, { count: number; cancelled: boolean }>()
  const add = (month: string, cancelled: boolean) => {
    const m = byMonth.get(month) ?? { count: 0, cancelled: false }
    byMonth.set(month, { count: m.count + (cancelled ? 0 : 1), cancelled: m.cancelled || cancelled })
  }
  for (const e of mine) if (!e.deleted_at || e.cancelled_at) add(e.start_date.slice(0, 7), !!e.cancelled_at)
  const eventDate = new Map(h.events.map((e) => [e.id, e.start_date]))
  for (const i of live(h.invites)) {
    const date = eventDate.get(i.event_id)
    if (mineIds.has(i.event_id) || !date) continue
    // Dropping out counts as cancelling.
    if (i.response === 'yes' || i.response === 'dropped') add(date.slice(0, 7), i.response === 'dropped')
  }
  v.adulting = [...byMonth.entries()].some(([month, m]) => monthEnd(month) < today && m.count >= 4 && !m.cancelled) ? 1 : 0

  // People (from the server)
  v.making_friends = h.connections ?? 0
  v.social_butterfly = h.connections ?? 0

  // Surprises
  v.that_was_fast = doneTasks.some((t) => t.created_at && new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime() <= 60_000) ? 1 : 0
  v.just_in_time = doneTasks.some((t) => {
    const m = localMoment(t.completed_at!, timeZone)
    return t.due_date === m.date && m.hour === 23 && m.minute >= 50
  })
    ? 1
    : 0
  v.boundaries = (h.blocks ?? 0) > 0 ? 1 : 0
  v.healthy_brain = ['habit_streak', 'journal_streak', 'routine_streak', 'perfect_streak', 'good_days'].every((id) => v[id]! >= 7) ? 1 : 0

  // Anniversaries
  v.anniversary = h.accountCreated ? Math.max(0, daysBetween(localMoment(h.accountCreated, timeZone).date, today)) : 0
  return v
}

export interface TrophyState {
  trophy: Trophy
  value: number
  /** Levels reached by my history now. */
  level: number
  /** Levels already saved (never goes down). */
  saved: number
}

/** Each trophy's value, its level from history, and the level already saved. */
export function trophyStates(values: Record<TrophyId, number>, badges: BadgeRow[]): TrophyState[] {
  const saved = new Map(live(badges).map((b) => [b.kind, b.levels?.length ?? 0]))
  return TROPHIES.map((trophy) => {
    const value = values[trophy.id] ?? 0
    return { trophy, value, level: levelFor(trophy, value), saved: saved.get(trophy.id) ?? 0 }
  })
}

/** Trophies whose level went up since last saved: what to save and celebrate. */
export function newLevels(states: TrophyState[]): TrophyState[] {
  return states.filter((s) => s.level > s.saved)
}

/** The shown level: whichever is higher, history or saved (a trophy is never taken away). */
export const shownLevel = (s: TrophyState) => Math.max(s.level, s.saved)

// ---------- Comebacks (SPEC §5 Trophies: messages, not trophies) ----------

/** Days away from the app before opening it again is a comeback. */
export const AWAY_DAYS = 7

/** A journal entry after 2 or more days without one. */
export function journalComeback(entries: JournalEntryRow[], date: string): boolean {
  const before = written(entries)
    .map((e) => e.date)
    .filter((d) => d < date)
    .sort()
    .at(-1)
  return !!before && daysBetween(before, date) >= 3
}

/** Finishing a task that carried over 3 or more days, or an Undated task older than 30 days. */
export function taskComeback(task: TaskRow, today: string, timeZone: string): 'carried' | 'old_undated' | null {
  if (task.due_date && daysBetween(task.due_date, today) >= 3) return 'carried'
  if (!task.due_date && task.created_at && daysBetween(localMoment(task.created_at, timeZone).date, today) > 30) return 'old_undated'
  return null
}
