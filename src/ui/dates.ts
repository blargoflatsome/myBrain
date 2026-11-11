// SPEC §5 Dates and times: how a calendar day ("YYYY-MM-DD"), a time ("HH:MM") or a moment (an ISO timestamp) is
// shown, the same way on every screen and the device's way. Days are read as UTC so they never shift with the zone.
import { formatTime } from '@/time/parse'

function format(date: string, options: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' })
}

/** "Tue, Nov 10" */
export const shortDay = (date: string) => format(date, { weekday: 'short', month: 'short', day: 'numeric' })
/** "Tue, Nov 10, 2026" */
export const shortDayWithYear = (date: string) => format(date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
/** "Nov 10, 2026" */
export const dateWithYear = (date: string) => format(date, { month: 'short', day: 'numeric', year: 'numeric' })

/** "Tue, Nov 10", with the year only when it isn't this year ("Tue, Jan 5, 2027"). */
export function dayLabel(date: string, today: string = localToday()): string {
  return date.slice(0, 4) === today.slice(0, 4) ? shortDay(date) : shortDayWithYear(date)
}

/** "8:30 am" (or "08:30" on a 24-hour device); accepts "HH:MM" or "HH:MM:SS". */
export const timeLabel = (time: string) => formatTime(time)

/** "Tue, Nov 10 · 8:30 am", or just the day when there's no time. */
export function dayTimeLabel(date: string, time?: string | null, today?: string): string {
  const day = dayLabel(date, today)
  return time ? `${day} · ${timeLabel(time)}` : day
}

/** When something happened: "8:30 am" if today, otherwise "Tue, Nov 10 · 8:30 am" (alerts, links, requests). */
export function momentLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  const day = localDay(d)
  const time = timeLabel(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  return day === localDay(now) ? time : `${dayLabel(day, localDay(now))} · ${time}`
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const localToday = () => localDay(new Date())
