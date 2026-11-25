// Calendar days and clock times (SPEC §5 Tasks: the day ends at midnight in my time zone). Dates are plain
// 'YYYY-MM-DD' strings, so daylight saving changes never shift a day: only "what is today's date in this timezone"
// and "what time is it there" depend on the clock. Monthly repeats stay with their features: habits fall on the last
// day of a short month, events skip it.

/** The device's current timezone, e.g. 'America/New_York'. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

// Building an Intl.DateTimeFormat is slow and "today" is asked for all over the app, so one is kept per time zone.
const dayFormats = new Map<string, Intl.DateTimeFormat>()

/** Today's calendar date in the given timezone. The day ends at midnight there. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  let format = dayFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormats.set(timeZone, format)
  }
  const parts = format.formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function toUtcMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

/** The "YYYY-MM-DD" day a stored moment (an ISO time) fell on, in a time zone. */
export const dayOf = (iso: string, timeZone: string): string => todayIn(timeZone, new Date(iso))

/** Whole calendar days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / 86_400_000)
}

/**
 * Whether a date falls in an "on" week: every week, or every other week counted from the week of the start date.
 * Weeks run Sunday to Saturday (SPEC §5: every week or every 2 weeks).
 */
export function onWeek(startDate: string, weekInterval: number | null | undefined, date: string): boolean {
  if (!weekInterval || weekInterval === 1) return true
  const sunday = (d: string) => toUtcMidnight(d) - new Date(toUtcMidnight(d)).getUTCDay() * 86_400_000
  const weeks = Math.round((sunday(date) - sunday(startDate)) / (7 * 86_400_000))
  return weeks % weekInterval === 0
}

export function addDays(date: string, days: number): string {
  return new Date(toUtcMidnight(date) + days * 86_400_000).toISOString().slice(0, 10)
}

/** 0 = Sunday ... 6 = Saturday for a YYYY-MM-DD date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()
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

const clockFormats = new Map<string, Intl.DateTimeFormat>()

/** The wall-clock time of a moment in a time zone, as "HH:MM" (24-hour). */
export function clockIn(ms: number, timeZone: string): string {
  let format = clockFormats.get(timeZone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
    clockFormats.set(timeZone, format)
  }
  const parts = format.formatToParts(new Date(ms))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Some engines write midnight as 24.
  return `${String(get('hour') % 24).padStart(2, '0')}:${String(get('minute')).padStart(2, '0')}`
}

/** The local day and time of a moment, in a time zone. */
export function localMoment(iso: string, timeZone: string): { date: string; hour: number; minute: number } {
  const d = new Date(iso)
  const [hour, minute] = clockIn(d.getTime(), timeZone).split(':').map(Number)
  return { date: todayIn(timeZone, d), hour: hour!, minute: minute! }
}
