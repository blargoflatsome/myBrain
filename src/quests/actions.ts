// Writing quests (SPEC §5 Random Quest).
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'
import type { ActionContext } from '@/sync/actions'
import { clipTitle } from '@/lib/titles'

/** Every new quest starts as Ugh and 30 min unless changed (SPEC §5 Random Quest). */
export const DEFAULT_QUEST_ENERGY: EnergyLevel = 'ugh'
export const DEFAULT_QUEST_TIME: TimeBucket = '30m'

/** A new quest as Capture, Orphans or the quest editor gives it. */
export type QuestDraft = Partial<Pick<QuestRow, 'id' | 'details' | 'energy_level' | 'time_bucket'>> & { title: string }

/** What + New quest opens the editor with: no name yet, and the defaults. */
export function blankQuest(): QuestRow {
  return { id: crypto.randomUUID(), user_id: '', title: '', details: null, energy_level: DEFAULT_QUEST_ENERGY, time_bucket: DEFAULT_QUEST_TIME, status: 'open', times_picked: 0, deleted_at: null }
}

export function questActions({ ready }: ActionContext) {
  /** Add a quest. Returns null when it has no name. */
  async function addQuest(draft: QuestDraft, now = new Date()) {
    const { engine: e, uid } = ready()
    const title = clipTitle(draft.title)
    if (!title) return null
    return e.save('quests', {
      id: draft.id ?? crypto.randomUUID(),
      user_id: uid,
      title,
      details: draft.details?.trim() || null,
      energy_level: draft.energy_level ?? DEFAULT_QUEST_ENERGY,
      time_bucket: draft.time_bucket ?? DEFAULT_QUEST_TIME,
      status: 'open',
      times_picked: 0,
      created_at: now.toISOString(),
      deleted_at: null,
    })
  }

  return { addQuest }
}
