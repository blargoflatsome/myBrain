import { describe, expect, it } from 'vitest'
import { byEffort } from '@/quests/picker'
import type { QuestRow } from '@/sync/types'

describe('Spec §5 Random Quest: the list is sorted by effort', () => {
  it('easiest first, then shortest, then by title; quests without energy or time go last', () => {
    const q = (title: string, energy_level: string | null, time_bucket: string | null) => ({ id: title, title, energy_level, time_bucket }) as QuestRow
    const out = [q('Paint', 'medicated', '30m'), q('Walk', 'ugh', '2h'), q('Call', 'ugh', '30m'), q('Idea', null, null), q('Bake', 'fun', 'half_day'), q('Apples', 'ugh', '30m')].sort(byEffort)
    expect(out.map((x) => x.title)).toEqual(['Apples', 'Call', 'Walk', 'Bake', 'Paint', 'Idea'])
  })
})

