// SPEC §5 Journal: everything a day's stats are worked out from, read from this device. Used by the journal, the
// Dashboard's "How past you did yesterday" and Up next.
import { readTables, type LocalDb } from '@/sync/db'
import { DAY_TABLES, type DayData } from '@/journal/stats'

/** The day's data; deleted quests are kept so a quest finished and later deleted still shows by name. */
export function readDayData(db: LocalDb): Promise<DayData> {
  return readTables(db, DAY_TABLES, { includeDeleted: ['quests'] })
}
