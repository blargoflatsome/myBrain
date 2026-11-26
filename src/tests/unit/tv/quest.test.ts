import { describe, expect, it } from 'vitest'
import type { QuestRow, TaskRow } from '@/sync/types'
import { drawOne } from '@/tv/screen/quest'

const TZ = 'America/New_York'
const TODAY = '2026-11-26'
const task = (id: string, due_date: string | null): TaskRow => ({ id, title: id, due_date, status: 'open', source: 'manual', deleted_at: null })
const quest = (id: string, extra: Partial<QuestRow> = {}): QuestRow => ({ id, title: id, status: 'open', deleted_at: null, ...extra })

describe('SPEC §9 Go on a Quest: the draw follows §5 Random Quest', () => {
  it("draws only the tasks that can be in it: the server's day of slack (tomorrow's task) stays out", () => {
    const draw = { quests: [], tasks: [task('tomorrow', '2026-11-27'), task('undated', null)] }
    const picks = new Set([0, 0.5, 0.99].map((r) => drawOne(draw, {}, [], TODAY, TZ, () => r)?.id))
    expect([...picks]).toEqual(['undated'])
  })

  it('skips quests that need more energy than I have, and in-progress ones', () => {
    const draw = { quests: [quest('hard', { energy_level: 'medicated' }), quest('busy', { status: 'accepted' }), quest('easy', { energy_level: 'ugh' })], tasks: [] }
    expect(drawOne(draw, { energy: 'fun' }, [], TODAY, TZ, () => 0.99)).toEqual({ kind: 'quest', id: 'easy' })
  })
})
