// Reading and writing badges, trophies, the activity log and the app's own alerts (SPEC §5 Celebrations, Trophies).
import type { ActivityKind, ActivityLogRow, NotificationRow } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { readTables } from '@/sync/db'
import { trophyRowId, type TrophyId } from '@/trophies/definitions'
import type { TrophyHistory } from '@/trophies/rules'
import { badgeId, type BadgeKind } from '@/celebrate/rules'

export function trophyActions({ ready, badgesReady }: ActionContext) {
  /** Keep a badge, earned now or (quietly) found in my history. Returns false if I already had it. */
  async function saveBadge(kind: BadgeKind, now = new Date()) {
    const { engine: e, uid, local } = ready()
    // Until my badges have downloaded, this device can't tell a new badge from one I already have.
    if (!badgesReady.value) return false
    if ((await local.badges.where('kind').equals(kind).toArray()).some((b) => !b.deleted_at)) return false
    await e.save('badges', { id: badgeId(uid, kind), user_id: uid, kind, earned_at: now.toISOString(), deleted_at: null })
    return true
  }

  /** Record something the app didn't keep before: a finished Focus session, a capture, emptying Orphans. */
  async function logActivity(kind: ActivityKind, detail: ActivityLogRow['detail'] = {}, now = new Date()) {
    const { engine: e, uid } = ready()
    await e.save('activity_log', { id: crypto.randomUUID(), user_id: uid, kind, at: now.toISOString(), detail, deleted_at: null })
  }

  /** Raise a trophy to a level (never lower), keeping the day each level was earned. Returns whether it rose. */
  async function saveTrophyLevel(id: TrophyId, level: number, now = new Date()) {
    const { engine: e, uid, local } = ready()
    if (!badgesReady.value) return false
    const rowId = trophyRowId(uid, id)
    const existing = await local.badges.get(rowId)
    const levels = [...(existing && !existing.deleted_at ? existing.levels ?? [] : [])]
    if (levels.length >= level) return false
    while (levels.length < level) levels.push(now.toISOString())
    await e.save('badges', { id: rowId, user_id: uid, kind: id, earned_at: existing?.earned_at ?? levels[0]!, levels, deleted_at: null })
    return true
  }

  /** Everything on this device that trophies are worked out from. */
  async function trophyHistory(extra: Pick<TrophyHistory, 'accountCreated' | 'connections' | 'blocks'>): Promise<TrophyHistory> {
    const { uid, local } = ready()
    const history = await readTables(local, {
      tasks: 'tasks',
      habits: 'habits',
      habitLogs: 'habit_logs',
      routines: 'routines',
      routineRuns: 'routine_runs',
      journalEntries: 'journal_entries',
      quests: 'quests',
      questLogs: 'quest_logs',
      vaultItems: 'vault_items',
      vaultBuckets: 'vault_buckets',
      priorityTasks: 'priority_tasks',
      priorityLogs: 'priority_task_logs',
      events: 'events',
      invites: 'event_invites',
      activity: 'activity_log',
    })
    return { ...history, userId: uid, ...extra }
  }

  /** An alert the app gives me itself (the next-day congratulations). Same id on every device, so it comes once. */
  async function addAlert(row: Omit<NotificationRow, 'user_id' | 'deleted_at'>) {
    const { engine: e, uid, local } = ready()
    if (await local.notifications.get(row.id)) return false
    await e.save('notifications', { ...row, user_id: uid, deleted_at: null })
    return true
  }

  return { saveBadge, logActivity, saveTrophyLevel, trophyHistory, addAlert }
}
