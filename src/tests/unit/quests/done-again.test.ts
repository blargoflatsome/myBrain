import { describe, expect, it } from 'vitest'
import { finishQuest, pickQuest } from '@/quests/picker'
import { questsFinished, yesterdaySummary } from '@/dashboard/stats'
import type { QuestRow } from '@/sync/types'

describe('Spec §5 Random Quest: quests can be done again', () => {
  const quest = (id: string, extra: Partial<QuestRow> = {}): QuestRow => ({ id, title: id, status: 'open', deleted_at: null, ...extra })

  it('marking a quest done puts it back in the list, so the picker can offer it again', () => {
    const done = finishQuest(quest('a', { status: 'accepted' }), new Date('2026-11-10T15:00:00Z'))
    expect(done.status).toBe('open')
    expect(done.completed_at).toBe('2026-11-10T15:00:00.000Z')
    expect(pickQuest([done], {}, () => 0)?.id).toBe('a')
  })

  it('every time a quest is done counts on the Dashboard', () => {
    const logs = [1, 2, 3].map((n) => ({ id: `l${n}`, quest_id: 'a', date: `2026-11-0${n}`, completed_at: `2026-11-0${n}T12:00:00Z`, deleted_at: null }))
    expect(questsFinished(logs, '2026-11-02', new Date('2026-11-10T15:00:00Z'), 'America/New_York')).toBe(2)
  })

  it('"How past you did yesterday" shows quests done yesterday, even when nothing was scheduled', () => {
    const s = yesterdaySummary({ tasks: { done: 0, due: 0 }, habits: { kept: 0, scheduled: 0 }, routines: [], priority: [], streaks: [], quests: ['Paint the fence'] })
    expect(s.quests).toEqual(['Paint the fence'])
    expect(s.empty).toBe(false)
  })
})

