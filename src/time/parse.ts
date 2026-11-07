// SPEC §5 Time fields: what I type in a time box ("8", "830", "8:30 pm", "18:00", "6p") becomes a 24-hour "HH:MM".

/** "HH:MM" from what was typed, or null if it isn't a time. Without am/pm, 1–11 are taken as morning, like Google Calendar. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '').replace(/\./g, '')
  const m = /^(\d{1,2})(?::?(\d{2}))?(a|am|p|pm)?$/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  const min = m[2] === undefined ? 0 : Number(m[2])
  const suffix = m[3]
  if (min > 59) return null
  if (suffix) {
    if (h < 1 || h > 12) return null
    if (suffix.startsWith('p') && h !== 12) h += 12
    if (suffix.startsWith('a') && h === 12) h = 0
  } else if (h > 23) {
    return null
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** Does this device show times on a 12-hour clock? */
export function uses12Hour(locale?: string): boolean {
  const cycle = new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle
  return cycle === 'h11' || cycle === 'h12'
}

/** "HH:MM" (or "HH:MM:SS") shown the device's way: "8:30 am" or "08:30". */
export function formatTime(value: string, twelveHour = uses12Hour()): string {
  const [hs, ms] = value.split(':')
  const h = Number(hs)
  const mm = (ms ?? '00').slice(0, 2)
  if (!twelveHour) return `${String(h).padStart(2, '0')}:${mm}`
  return `${h % 12 || 12}:${mm} ${h < 12 ? 'am' : 'pm'}`
}

/** Every 15 minutes through the day, for the list under a time box. */
export const QUARTER_HOURS: string[] = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

/** The listed time nearest to a value (for where the list opens). */
export function nearestQuarter(value: string | null | undefined, fallback = '08:00'): string {
  const v = value ? value.slice(0, 5) : fallback
  const [h, m] = v.split(':').map(Number)
  const q = Math.round(((h ?? 0) * 60 + (m ?? 0)) / 15) % 96
  return QUARTER_HOURS[q]!
}
