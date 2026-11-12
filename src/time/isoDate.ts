// SPEC §5 Date fields: a day typed or pasted as "YYYY-MM-DD" needs no date library, so the date box reads it at once,
// even before the typed-date reader (parseDate.ts) has loaded.

/** The day if `text` is a real "YYYY-MM-DD" date, else null ("2026-02-30" is null). */
export function readIsoDate(text: string): string | null {
  const t = text.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const [y, m, d] = t.split('-').map(Number)
  const date = new Date(Date.UTC(y!, m! - 1, d!))
  return date.getUTCMonth() === m! - 1 && date.getUTCDate() === d ? t : null
}
