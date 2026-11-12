// Reading and writing journal entries and their stats (SPEC §5 Journal).
import type { JournalEntryRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import type { LocalDb } from '@/sync/db'
import { readTables } from '@/sync/db'
import { DAY_TABLES, dayStats, emptyEntry, hadActivity, missingDays, statsUpdate, type DayData } from '@/journal/stats'
import { normalizeBody } from '@/journal/body'
import { deviceTimeZone, todayIn } from '@/tasks/days'
import { achieved } from '@/celebrate/bus'

type JournalFields = { tomorrow?: string; better_than_yesterday?: boolean | null }

/** The day's entry, if it has one (a day has at most one live entry). */
async function entryFor(local: LocalDb, date: string): Promise<JournalEntryRow | undefined> {
  return (await local.journal_entries.where('date').equals(date).toArray()).find((x) => !x.deleted_at)
}

export function journalActions({ ready, habitsReady }: ActionContext) {
  async function dayData(): Promise<DayData> {
    return readTables(ready().local, DAY_TABLES)
  }

  /** The stats for a day, worked out from the on-device history (shown live for today). */
  async function journalStats(date: string, now = new Date(), timeZone = deviceTimeZone()) {
    return dayStats(await dayData(), date, now, timeZone)
  }

  /**
   * Write an entry on my behalf for each day that ended without one (if I did something that day), keep today's
   * stats current, and freeze the stats of days that have ended. Only runs once this device has the server's habits
   * and journal, so a fresh device never writes over entries it has not downloaded yet. Safe to run often.
   */
  async function refreshJournal(now = new Date(), timeZone = deviceTimeZone()) {
    const { engine: e, uid, local } = ready()
    if (!habitsReady.value || !(await local.meta.get('downloaded:journal_entries'))) return
    const today = todayIn(timeZone, now)
    const data = await dayData()
    const entries = await local.journal_entries.toArray()
    // When this device started journaling, so no entries are invented for days before it.
    let start = (await local.meta.get('journal_start'))?.value
    if (!start) {
      start = today
      await local.meta.put({ key: 'journal_start', value: start })
    }
    for (const date of missingDays(entries, today, start)) {
      const stats = dayStats(data, date, now, timeZone)
      if (!hadActivity(stats)) continue // a day with nothing done gets no entry
      await e.save('journal_entries', { ...emptyEntry(uid, date, true), stats, stats_final: true })
    }
    for (const entry of entries) {
      if (entry.deleted_at || entry.stats_final) continue
      const stats = dayStats(data, entry.date, now, timeZone)
      await e.patch('journal_entries', entry.id, (fresh) => statsUpdate(fresh, stats, today))
    }
  }

  // Saves for the same day run one at a time, so two saves at once (writing and the tomorrow box, or quick
  // Yes/No taps) can't both find no entry and each make one: a day has one journal entry.
  const journalSaves = new Map<string, Promise<unknown>>()
  function oneAtATime<T>(date: string, work: () => Promise<T>): Promise<T> {
    const next = (journalSaves.get(date) ?? Promise.resolve()).catch(() => undefined).then(work)
    journalSaves.set(date, next)
    void next.finally(() => journalSaves.get(date) === next && journalSaves.delete(date)).catch(() => undefined)
    return next
  }

  /** Save what I wrote for a day. Writing in an entry the app made makes it mine. Always editable. */
  function saveJournalBody(date: string, html: string, now = new Date(), timeZone = deviceTimeZone()) {
    return oneAtATime(date, () => storeJournalBody(date, html, now, timeZone))
  }
  async function storeJournalBody(date: string, html: string, now: Date, timeZone: string) {
    const { engine: e, uid, local } = ready()
    const body = normalizeBody(html)
    const existing = await entryFor(local, date)
    const auto = (row: JournalEntryRow) => row.auto && !body
    if (existing) {
      if (existing.body === body) return
      await e.patch('journal_entries', existing.id, (fresh) => (fresh.body === body ? null : { body, auto: auto(fresh) }))
    } else {
      const stats = dayStats(await dayData(), date, now, timeZone)
      await e.save('journal_entries', { ...emptyEntry(uid, date, false), body, stats, stats_final: date < todayIn(timeZone, now) })
    }
    if (body) achieved({ kind: 'journal' })
  }

  /**
   * Save the journal's other answers for a day: "How to make tomorrow better?" and "Was today better than
   * yesterday?". Creates the day's entry if needed; always editable.
   */
  function saveJournalFields(date: string, fields: JournalFields, now = new Date(), timeZone = deviceTimeZone()) {
    return oneAtATime(date, () => storeJournalFields(date, fields, now, timeZone))
  }
  async function storeJournalFields(date: string, fields: JournalFields, now: Date, timeZone: string) {
    const { engine: e, uid, local } = ready()
    const existing = await entryFor(local, date)
    if (fields.tomorrow !== undefined) fields = { ...fields, tomorrow: normalizeBody(fields.tomorrow) }
    if (existing) {
      await e.patch('journal_entries', existing.id, () => ({ ...fields, auto: false }))
      return
    }
    const stats = dayStats(await dayData(), date, now, timeZone)
    await e.save('journal_entries', { ...emptyEntry(uid, date, false), ...fields, stats, stats_final: date < todayIn(timeZone, now) })
  }

  return { journalStats, refreshJournal, saveJournalBody, saveJournalFields }
}
