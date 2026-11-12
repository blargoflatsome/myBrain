// Habit rules (SPEC §5 Habits): weekdays, timer deadlines, misses, and streaks.
// habit_logs is the source of truth; the cached streak numbers on a habit are recalculated from it.
import type { HabitLogRow, HabitPauseRow, HabitRow } from '@/sync/types'
import { addDays, onWeek, todayIn } from '@/tasks/days'

/** 'paused': a scheduled day while Pause all streaks was on (SPEC §5 Habits); it neither extends nor breaks a streak. */
export type DayStatus = 'not_scheduled' | 'completed' | 'missed' | 'open' | 'paused'
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/** The chosen weekdays with one day switched on or off, in order; the last chosen day can't be switched off. */
export function toggleWeekday(days: readonly number[], day: number): number[] {
  const has = days.includes(day)
  if (has && days.length === 1) return [...days]
  return has ? days.filter((d) => d !== day) : [...days, day].sort()
}

/** 0 = Sunday ... 6 = Saturday for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
}

export function isScheduled(habit: HabitRow, date: string): boolean {
  if (date < habit.start_date) return false
  if (habit.monthly) return onMonthDay(habit.start_date, date)
  return habit.weekdays.includes(weekdayOf(date)) && onWeek(habit.start_date, habit.week_interval, date)
}

/** Every month on the start date's day; a 29th-31st falls on the last day of a shorter month (SPEC §5 Habits). */
export function onMonthDay(startDate: string, date: string): boolean {
  const [y, m, d] = date.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return d === Math.min(Number(startDate.slice(8, 10)), lastDay)
}

// Building an Intl.DateTimeFormat is slow, and streaks ask for offsets on many days, so one is kept per time zone.
const offsetFormats = new Map<string, Intl.DateTimeFormat>()
function offsetFormat(timeZone: string): Intl.DateTimeFormat {
  let f = offsetFormats.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    offsetFormats.set(timeZone, f)
  }
  return f
}

/** Offset of a timezone from UTC at a moment, in milliseconds. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = offsetFormat(timeZone).formatToParts(new Date(utcMs))
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** The moment a local wall-clock time happens in a timezone (handles daylight saving). */
export function zonedTime(date: string, time: string, timeZone: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y!, m! - 1, d!, hh!, mm!)
  let result = guess - offsetAt(guess, timeZone)
  const second = guess - offsetAt(result, timeZone)
  if (second !== result) result = second
  return result
}

/** True when the day's deadline is simply midnight: no timer, or the day the habit was created. */
export function dueByMidnight(habit: HabitRow, date: string): boolean {
  return !(habit.notify_time && habit.timer_minutes) || date === habit.start_date
}

/**
 * When a habit must be done by on a day: notify time + timer, or midnight when there is no timer.
 * The timer starts at the notify time (SPEC §5 Habits). On the day a habit is created it is always due by
 * midnight, so a habit made after its timer window has passed is not missed the moment it is saved.
 */
export function deadline(habit: HabitRow, date: string, timeZone: string): number {
  if (!dueByMidnight(habit, date)) {
    return zonedTime(date, habit.notify_time!, timeZone) + habit.timer_minutes! * 60_000
  }
  return zonedTime(addDays(date, 1), '00:00', timeZone)
}

/** A habit's live logs by date, so walking its history looks each day up once instead of searching the list. */
function logsByDate(logs: readonly HabitLogRow[], habitId: string): Map<string, HabitLogRow> {
  const byDate = new Map<string, HabitLogRow>()
  for (const l of logs) if (l.habit_id === habitId && !l.deleted_at && !byDate.has(l.date)) byDate.set(l.date, l)
  return byDate
}

function liveLog(logs: readonly HabitLogRow[], habitId: string, date: string) {
  return logs.find((l) => l.habit_id === habitId && l.date === date && !l.deleted_at)
}

/**
 * Days before this one are over whatever the timer: a deadline is at most a day and a timer (24 hours) after the
 * day starts, plus an hour for a daylight saving change. Only the last few days need the time zone maths.
 */
const settledBefore = (today: string) => addDays(today, -2)

function isLate(habit: HabitRow, date: string, now: Date, timeZone: string, settled: string): boolean {
  return date < settled || now.getTime() > deadline(habit, date, timeZone)
}

/** The pause still on, if any. */
export function openPause(pauses: readonly HabitPauseRow[]): HabitPauseRow | undefined {
  return pauses.find((p) => !p.deleted_at && !p.end_date)
}

/**
 * Turning Pause all streaks on (SPEC §5 Habits): a new pause from today, or today's own pause opened again if I turned
 * it off earlier today. Null when already paused.
 */
export function pauseFrom(
  pauses: readonly HabitPauseRow[],
  today: string,
  userId: string,
  newId: () => string = () => crypto.randomUUID(),
): HabitPauseRow | null {
  if (openPause(pauses)) return null
  const endedToday = pauses.find((p) => !p.deleted_at && p.end_date === today)
  if (endedToday) return { ...endedToday, end_date: null }
  return { id: newId(), user_id: userId, start_date: today, end_date: null, deleted_at: null }
}

/** Turning it off ends the pause after today, so today stays paused. Null when not paused. */
export function resumeAfter(pauses: readonly HabitPauseRow[], today: string): HabitPauseRow | null {
  const open = openPause(pauses)
  return open ? { ...open, end_date: today < open.start_date ? open.start_date : today } : null
}

/** Whether Pause all streaks covered this day (SPEC §5 Habits). */
export function pausedOn(pauses: readonly HabitPauseRow[], date: string): boolean {
  return pauses.some((p) => !p.deleted_at && p.start_date <= date && (!p.end_date || p.end_date >= date))
}

function statusWith(habit: HabitRow, date: string, log: HabitLogRow | undefined, late: boolean, paused: boolean): DayStatus {
  if (!isScheduled(habit, date)) return 'not_scheduled'
  // A day checked off while paused still counts as kept.
  if (log?.status === 'completed') return 'completed'
  if (paused) return 'paused'
  // A "missed" log written before the deadline (for example by an older version of the app) does not count, so
  // a day is missed only once its deadline has passed.
  return late ? 'missed' : 'open'
}

export function dayStatus(
  habit: HabitRow,
  date: string,
  logs: readonly HabitLogRow[],
  now: Date,
  timeZone: string,
  pauses: readonly HabitPauseRow[] = [],
): DayStatus {
  if (!isScheduled(habit, date)) return 'not_scheduled'
  const late = isLate(habit, date, now, timeZone, settledBefore(todayIn(timeZone, now)))
  return statusWith(habit, date, liveLog(logs, habit.id, date), late, pausedOn(pauses, date))
}

/** Each day's status from the habit's start to today, walking its history once (SPEC §5 Habits). */
export function dayStatuses(
  habit: HabitRow,
  logs: readonly HabitLogRow[],
  now: Date,
  timeZone: string,
  from = habit.start_date,
  pauses: readonly HabitPauseRow[] = [],
) {
  const today = todayIn(timeZone, now)
  const settled = settledBefore(today)
  const byDate = logsByDate(logs, habit.id)
  const days: { date: string; status: DayStatus; logged: boolean }[] = []
  for (let date = from < habit.start_date ? habit.start_date : from; date <= today; date = addDays(date, 1)) {
    if (!isScheduled(habit, date)) {
      days.push({ date, status: 'not_scheduled', logged: byDate.has(date) })
      continue
    }
    const log = byDate.get(date)
    const late = log?.status === 'completed' ? false : isLate(habit, date, now, timeZone, settled)
    days.push({ date, status: statusWith(habit, date, log, late, pausedOn(pauses, date)), logged: !!log })
  }
  return days
}

/** "Missed" logs whose day is in fact still open. They are removed so the history stays true. */
export function wrongMisses(habit: HabitRow, logs: readonly HabitLogRow[], now: Date, timeZone: string): HabitLogRow[] {
  const settled = settledBefore(todayIn(timeZone, now))
  return logs.filter(
    (l) => l.habit_id === habit.id && !l.deleted_at && l.status === 'missed' && !isLate(habit, l.date, now, timeZone, settled),
  )
}

/**
 * Current and best streak, counted over scheduled days from the habit's start to today.
 * A completed day extends the streak, a missed day resets it to zero (the best is kept), and today
 * while still open neither extends nor breaks it. Days the habit isn't scheduled are skipped.
 */
export function streaks(habit: HabitRow, logs: readonly HabitLogRow[], now: Date, timeZone: string, pauses: readonly HabitPauseRow[] = []) {
  let current = 0
  let best = 0
  for (const { status } of dayStatuses(habit, logs, now, timeZone, habit.start_date, pauses)) {
    if (status === 'completed') best = Math.max(best, ++current)
    else if (status === 'missed') current = 0
  }
  return { current, best: Math.max(best, current) }
}

/**
 * "Kept 26 of the last 30" (SPEC §5 Habits): of the scheduled days in the last `days` days, how many were kept,
 * out of those already settled (today counts only once it's kept or missed).
 */
export function keptLately(
  habit: HabitRow,
  logs: readonly HabitLogRow[],
  now: Date,
  timeZone: string,
  pauses: readonly HabitPauseRow[] = [],
  days = 30,
) {
  const from = addDays(todayIn(timeZone, now), 1 - days)
  let kept = 0
  let total = 0
  for (const { status } of dayStatuses(habit, logs, now, timeZone, from, pauses)) {
    if (status === 'completed') kept++
    if (status === 'completed' || status === 'missed') total++
  }
  return { kept, total }
}

/** Scheduled days whose deadline passed with nothing logged: these get a "missed" log (SPEC §5 Habits). */
export function missedDaysToRecord(
  habit: HabitRow,
  logs: readonly HabitLogRow[],
  now: Date,
  timeZone: string,
  pauses: readonly HabitPauseRow[] = [],
): string[] {
  return dayStatuses(habit, logs, now, timeZone, habit.start_date, pauses)
    .filter((d) => d.status === 'missed' && !d.logged)
    .map((d) => d.date)
}

/** What tapping a habit does today: complete it, undo a completion before the deadline, or nothing once missed. */
export function toggleAction(
  habit: HabitRow,
  date: string,
  logs: readonly HabitLogRow[],
  now: Date,
  timeZone: string,
  pauses: readonly HabitPauseRow[] = [],
): { kind: 'complete' } | { kind: 'undo'; log: HabitLogRow } | { kind: 'none' } {
  const status = dayStatus(habit, date, logs, now, timeZone, pauses)
  // I can still check habits off while paused (SPEC §5 Habits).
  if (status === 'open' || status === 'paused') return { kind: 'complete' }
  if (status === 'completed' && now.getTime() <= deadline(habit, date, timeZone)) {
    return { kind: 'undo', log: liveLog(logs, habit.id, date)! }
  }
  return { kind: 'none' }
}

/** The id of a habit's log for a day: the same habit and day always give the same id (see `sync/ids.ts`). */
export { logIdFor } from '@/sync/ids'

export function newHabit(title: string, userId: string, timeZone: string, now = new Date(), id: string = crypto.randomUUID()): HabitRow {
  return {
    id,
    user_id: userId,
    title: title.trim(),
    notify_time: null,
    timer_minutes: null,
    weekdays: [...ALL_WEEKDAYS],
    start_date: todayIn(timeZone, now),
    is_private: false,
    current_streak: 0,
    best_streak: 0,
    deleted_at: null,
  }
}
