// Month grids for the date picker (SPEC §5 Date fields). Kept apart from the typed-date reader, which is large and
// only loads where a date can be typed.

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
