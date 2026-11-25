// Filing captured thoughts and Orphans (SPEC §5 Quick capture, Orphans).
import { getRow } from '@/sync/db'
import { live } from '@/sync/live'
import { removeWithUndo, type ActionContext, type Undo } from '@/sync/actions'
import type { habitActions } from '@/habits/actions'
import type { questActions } from '@/quests/actions'
import type { taskActions } from '@/tasks/actions'
import type { trophyActions } from '@/trophies/actions'
import type { vaultActions } from '@/vault/actions'
import type { postItActions } from '@/postits/actions'
import { CaptureError, fitTitle, type CaptureInput, type Captured } from '@/capture/capture'
import { DEFAULT_POST_IT_COLOR } from '@/postits/rules'
import { toEditorHtml } from '@/journal/body'
import { achieved } from '@/celebrate/bus'

/** Each kind's own add, so every way in gets the same defaults, checks and celebration. */
export interface CaptureAdds {
  addTask: ReturnType<typeof taskActions>['addTask']
  addVaultItem: ReturnType<typeof vaultActions>['addVaultItem']
  addQuest: ReturnType<typeof questActions>['addQuest']
  addHabit: ReturnType<typeof habitActions>['addHabit']
  addPostIt: ReturnType<typeof postItActions>['addPostIt']
  logActivity: ReturnType<typeof trophyActions>['logActivity']
}

export function captureActions({ ready }: ActionContext, adds: CaptureAdds) {
  /** File a thought as the kind chosen. A Post It's text is its formatted note. Throws CaptureError when refused. */
  async function fileAs(input: CaptureInput, now: Date): Promise<Captured> {
    if (input.destination === 'postit') {
      const row = await adds.addPostIt(input.text, input.color ?? DEFAULT_POST_IT_COLOR, now)
      if (!row) throw new CaptureError('empty')
      return { table: 'post_its', id: row.id }
    }
    if (!input.text.trim()) throw new CaptureError('empty')
    if (input.destination === 'later') {
      const { engine: e, uid } = ready()
      const row = await e.save('inbox', { id: crypto.randomUUID(), user_id: uid, body: input.text.trim(), created_at: now.toISOString(), deleted_at: null })
      return { table: 'inbox', id: row.id }
    }
    // A title is one line; anything after the first line (or past 500 characters) moves into the notes.
    const { title, notes } = fitTitle(input.text, input.notes)
    switch (input.destination) {
      case 'task': {
        const row = await adds.addTask({ title, notes, due_date: input.dueDate, priority: input.priority, reminder_time: input.reminderTime, source: 'capture' }, now)
        if (!row) throw new CaptureError('reminder')
        return { table: 'tasks', id: row.id }
      }
      case 'vault': {
        if (!input.bucketId) throw new CaptureError('bucket')
        const row = await adds.addVaultItem(input.bucketId, { title, notes, rating: input.rating, link: input.link }, now)
        return { table: 'vault_items', id: row!.id }
      }
      case 'quest': {
        const row = await adds.addQuest({ title, details: notes, energy_level: input.energy, time_bucket: input.time }, now)
        return { table: 'quests', id: row!.id }
      }
      case 'habit': {
        const h = input.habit
        const row = await adds.addHabit(
          h
            ? { title, weekdays: h.weekdays, week_interval: h.weekInterval, monthly: !!h.monthly, start_date: h.startDate ?? undefined, notify_time: h.notifyTime, timer_minutes: h.timerMinutes, is_priority: h.isPriority }
            : { title },
          now,
        )
        return { table: 'habits', id: row!.id }
      }
    }
  }

  /** Save a captured thought. Resolves once it is stored on this device, online or not, and counts the capture. */
  async function capture(input: CaptureInput, now = new Date()): Promise<Captured> {
    const filed = await fileAs(input, now)
    await adds.logActivity('capture', { type: input.destination })
    // A Post It says so itself (its own First); everything else says a capture was saved.
    if (input.destination !== 'postit') achieved({ kind: 'capture' })
    return filed
  }

  /** File an Orphan as the kind chosen. It isn't counted as a capture: it was counted when captured. */
  async function fileOrphan(id: string, choice: Omit<CaptureInput, 'text'>, now = new Date()): Promise<Captured | null> {
    const { engine: e, local } = ready()
    const orphan = await getRow(local, 'inbox', id)
    if (!orphan) return null
    // A Post It has no title, so all the words become its note.
    const filed = await fileAs({ ...choice, text: choice.destination === 'postit' ? toEditorHtml(orphan.body) : orphan.body }, now)
    await e.remove('inbox', id)
    await afterOrphanGone()
    achieved({ kind: 'orphan' })
    return filed
  }

  /** Delete an orphan without filing it. Its Undo also takes back an emptied-Orphans count it caused. */
  async function removeOrphan(id: string): Promise<Undo> {
    const putBack = await removeWithUndo(ready, 'inbox', [id])
    const logged = await afterOrphanGone()
    return async () => {
      await putBack()
      if (logged) await ready().engine.remove('activity_log', logged)
    }
  }

  // Emptying the Orphans list counts toward a trophy (SPEC §5 Trophies). Returns the count's row, if it made one.
  async function afterOrphanGone() {
    if (live(await ready().local.inbox.toArray()).length) return null
    return adds.logActivity('orphans_cleared')
  }

  return { capture, fileOrphan, removeOrphan }
}
