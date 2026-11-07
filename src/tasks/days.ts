// Calendar-day math for tasks (SPEC §5 Tasks). Dates are plain 'YYYY-MM-DD' strings, so daylight saving
// changes never shift a day: only "what is today's date in this timezone" depends on the clock.

/** The device's current timezone, e.g. 'America/New_York'. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Today's calendar date in the given timezone. The day ends at midnight there. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

function toUtcMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y!, m! - 1, d!)
}

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
