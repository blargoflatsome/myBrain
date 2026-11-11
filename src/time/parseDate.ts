// SPEC §5 Date fields: what I type in a date box ("tomorrow", "Fri", "Nov 20", "11/20", "2026-11-20", "in 3 days")
// becomes a "YYYY-MM-DD" day. A day with no year means the next one coming.
import * as chrono from 'chrono-node'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "YYYY-MM-DD" from what was typed, or null if it isn't a day. `today` is "YYYY-MM-DD" in my time zone. */
export function parseDate(text: string, today: string): string | null {
  const t = text.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return validIso(t)
  const found = chrono.en.casual.parse(t, new Date(`${today}T12:00:00`), { forwardDate: true })[0]
  if (!found || !(found.start.isCertain('day') || found.start.isCertain('weekday'))) return null
  return iso(found.start.date())
}

function validIso(t: string): string | null {
  const [y, m, d] = t.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return date.getUTCMonth() === m! - 1 && date.getUTCDate() === d ? t : null
}

/** The weeks shown for a month: rows of seven "YYYY-MM-DD" days, Sunday first, padded with the next/previous month. */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y!, m! - 1, 1))
  const start = new Date(first)
  start.setUTCDate(1 - first.getUTCDay())
  const weeks: string[][] = []
  const d = new Date(start)
  do {
    const week: string[] = []
    for (let i = 0; i < 7; i++) {
      week.push(d.toISOString().slice(0, 10))
      d.setUTCDate(d.getUTCDate() + 1)
    }
    weeks.push(week)
  } while (d.getUTCMonth() === m! - 1)
  return weeks
}

/** The same day moved by a number of months, kept inside the shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const target = new Date(Date.UTC(y!, m! - 1 + months, 1))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(d!, last))
  return target.toISOString().slice(0, 10)
}
