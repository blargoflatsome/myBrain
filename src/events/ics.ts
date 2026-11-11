// Calendar files (.ics) for guests (SPEC §5 Shared events): "Add to my calendar" on the guest page.
import { zonedTime } from '@/habits/rules'
import { addDays } from '@/tasks/days'
import { textLines } from '@/journal/body'
import type { EventRepeat } from '@/sync/types'

export interface IcsEvent {
  uid: string
  title: string
  notes?: string | null
  start_date: string
  start_time: string | null
  end_date: string
  end_time: string | null
  repeat: EventRepeat
  timezone: string
  organizer?: string | null
}

function escapeText(text: string) {
  // Every kind of line break (\r\n, \n, or a lone \r) becomes \n, so typed text can never start a new calendar line.
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n')
}
/** A parameter value (like a name): quoted, with quotes and line breaks removed, so a colon or semicolon can't break it. */
function paramText(text: string) {
  return `"${text.replace(/["\r\n]/g, ' ').trim()}"`
}
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const day = (date: string) => date.replaceAll('-', '')

const RULES: Record<EventRepeat, string | null> = {
  never: null,
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
  biweekly: 'FREQ=WEEKLY;INTERVAL=2',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
}

/** Fold long lines at 75 characters, as calendar files require. */
function fold(line: string) {
  const out: string[] = []
  for (let i = 0; i < line.length; i += 74) out.push((i ? ' ' : '') + line.slice(i, i + 74))
  return out.join('\r\n')
}

export function icsFile(e: IcsEvent, now: Date = new Date()): string {
  const timed = !!(e.start_time && e.end_time)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//My Brain//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}@myadhdbrain`,
    `DTSTAMP:${utc(now.getTime())}`,
    timed ? `DTSTART:${utc(zonedTime(e.start_date, e.start_time!.slice(0, 5), e.timezone))}` : `DTSTART;VALUE=DATE:${day(e.start_date)}`,
    timed ? `DTEND:${utc(zonedTime(e.end_date, e.end_time!.slice(0, 5), e.timezone))}` : `DTEND;VALUE=DATE:${day(addDays(e.end_date, 1))}`,
    `SUMMARY:${escapeText(e.title)}`,
    ...(e.notes ? [`DESCRIPTION:${escapeText(textLines(e.notes))}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${paramText(e.organizer)}:invalid:nomail`] : []),
    ...(RULES[e.repeat] ? [`RRULE:${RULES[e.repeat]}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** Save the calendar file on this device. */
export function downloadIcs(e: IcsEvent) {
  const blob = new Blob([icsFile(e)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${e.title.replace(/[^\w -]+/g, '').trim() || 'event'}.ics`
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
