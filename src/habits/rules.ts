// Habit rules (SPEC §5 Habits): weekdays, timer deadlines, misses, and streaks.
// habit_logs is the source of truth; the cached streak numbers on a habit are recalculated from it.
import type { HabitLogRow, HabitRow } from '@/sync/types'
import { addDays, onWeek, todayIn } from '@/tasks/days'

export type DayStatus = 'not_scheduled' | 'completed' | 'missed' | 'open'
export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

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

/** Offset of a timezone from UTC at a moment, in milliseconds. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(utcMs))
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

function liveLog(logs: HabitLogRow[], habitId: string, date: string) {
  return logs.find((l) => l.habit_id === habitId && l.date === date && !l.deleted_at)
}

export function dayStatus(habit: HabitRow, date: string, logs: HabitLogRow[], now: Date, timeZone: string): DayStatus {
  if (!isScheduled(habit, date)) return 'not_scheduled'
  const log = liveLog(logs, habit.id, date)
  const late = now.getTime() > deadline(habit, date, timeZone)
  if (log?.status === 'completed') return 'completed'
  // A "missed" log written before the deadline (for example by an older version of the app) does not count.
  if (log?.status === 'missed') return late ? 'missed' : 'open'
  return late ? 'missed' : 'open'
}

/** "Missed" logs whose day is in fact still open. They are removed so the history stays true. */
export function wrongMisses(habit: HabitRow, logs: HabitLogRow[], now: Date, timeZone: string): HabitLogRow[] {
  return logs.filter(
    (l) => l.habit_id === habit.id && !l.deleted_at && l.status === 'missed' && now.getTime() <= deadline(habit, l.date, timeZone),
  )
}

/**
 * Current and best streak, counted over scheduled days from the habit's start to today.
 * A completed day extends the streak, a missed day resets it to zero (the best is kept), and today
 * while still open neither extends nor breaks it. Days the habit isn't scheduled are skipped.
 */
export function streaks(habit: HabitRow, logs: HabitLogRow[], now: Date, timeZone: string) {
  const today = todayIn(timeZone, now)
  let current = 0
  let best = 0
  for (let date = habit.start_date; date <= today; date = addDays(date, 1)) {
    const status = dayStatus(habit, date, logs, now, timeZone)
    if (status === 'completed') best = Math.max(best, ++current)
    else if (status === 'missed') current = 0
  }
  return { current, best: Math.max(best, current) }
}

/** Scheduled days whose deadline passed with nothing logged: these get a "missed" log (SPEC §5 Habits). */
export function missedDaysToRecord(habit: HabitRow, logs: HabitLogRow[], now: Date, timeZone: string): string[] {
  const today = todayIn(timeZone, now)
  const days: string[] = []
  for (let date = habit.start_date; date <= today; date = addDays(date, 1)) {
    if (isScheduled(habit, date) && !liveLog(logs, habit.id, date) && now.getTime() > deadline(habit, date, timeZone)) {
      days.push(date)
    }
  }
  return days
}

/** What tapping a habit does today: complete it, undo a completion before the deadline, or nothing once missed. */
export function toggleAction(
  habit: HabitRow,
  date: string,
  logs: HabitLogRow[],
  now: Date,
  timeZone: string,
): { kind: 'complete' } | { kind: 'undo'; log: HabitLogRow } | { kind: 'none' } {
  const status = dayStatus(habit, date, logs, now, timeZone)
  if (status === 'open') return { kind: 'complete' }
  if (status === 'completed' && now.getTime() <= deadline(habit, date, timeZone)) {
    return { kind: 'undo', log: liveLog(logs, habit.id, date)! }
  }
  return { kind: 'none' }
}

/**
 * The id of a habit's log for a day. The same habit and day always give the same id, so two devices logging the
 * same day update one row instead of colliding, and undo-then-redo reuses it (SPEC §7: last write wins).
 * Format: the habit id's first 24 characters + the date's 8 digits + "0000" (a valid uuid).
 */
export function logIdFor(habitId: string, date: string): string {
  return `${habitId.slice(0, 24)}${date.replaceAll('-', '')}0000`
}

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
