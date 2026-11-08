// How a calendar day ("YYYY-MM-DD") is shown, the device's way. Read as UTC so the day never shifts with the time zone.

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
