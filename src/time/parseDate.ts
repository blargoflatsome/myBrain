// SPEC §5 Date fields: what I type in a date box ("tomorrow", "Fri", "Nov 20", "11/20", "2026-11-20", "in 3 days")
// becomes a "YYYY-MM-DD" day. A day with no year means the next one coming.
import { casual } from 'chrono-node/en'
import { readIsoDate } from '@/time/isoDate'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** "YYYY-MM-DD" from what was typed, or null if it isn't a day. `today` is "YYYY-MM-DD" in my time zone. */
export function parseDate(text: string, today: string): string | null {
  const t = text.trim()
  if (!t) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return readIsoDate(t)
  const found = casual.parse(t, new Date(`${today}T12:00:00`), { forwardDate: true })[0]
  if (!found || !(found.start.isCertain('day') || found.start.isCertain('weekday'))) return null
  return iso(found.start.date())
}
