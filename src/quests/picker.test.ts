import { describe, expect, it } from 'vitest'
import type { QuestRow } from '@/sync/types'
import { acceptQuest, finishQuest, markPicked, matchingQuests, pickQuest, recentlyPicked } from './picker'

function quest(id: string, over: Partial<QuestRow> = {}): QuestRow {
  return { id, title: id, status: 'open', deleted_at: null, ...over }
}
const ids = (qs: QuestRow[]) => qs.map((q) => q.id).sort()

describe('Spec §5 Random Quest: filter by energy available (Meh < Ugh < Needs setup < Medicated)', () => {
  const qs = [
    quest('meh', { energy_level: 'meh' }),
    quest('ugh', { energy_level: 'ugh' }),
    quest('setup', { energy_level: 'needs_setup' }),
    quest('med', { energy_level: 'medicated' }),
  ]
  it('Meh offers only Meh quests', () => expect(ids(matchingQuests(qs, { energy: 'meh' }))).toEqual(['meh']))
  it('Ugh offers Meh and Ugh quests', () => expect(ids(matchingQuests(qs, { energy: 'ugh' }))).toEqual(['meh', 'ugh']))
  it('Needs setup offers Meh, Ugh and Needs setup quests', () =>
    expect(ids(matchingQuests(qs, { energy: 'needs_setup' }))).toEqual(['meh', 'setup', 'ugh']))
  it('Medicated offers everything', () =>
    expect(ids(matchingQuests(qs, { energy: 'medicated' }))).toEqual(['med', 'meh', 'setup', 'ugh']))
})

describe('Spec §5 Random Quest: filter by time available', () => {
  const qs = [
    quest('30m', { time_bucket: '30m' }),
    quest('2h', { time_bucket: '2h' }),
    quest('half', { time_bucket: 'half_day' }),
    quest('full', { time_bucket: 'full_day' }),
  ]
  it('30 min offers only 30-minute quests', () => expect(ids(matchingQuests(qs, { time: '30m' }))).toEqual(['30m']))
  it('half a day offers anything up to half a day', () =>
    expect(ids(matchingQuests(qs, { time: 'half_day' }))).toEqual(['2h', '30m', 'half']))
  it('time and energy filters combine', () => {
    const mixed = [quest('a', { time_bucket: '30m', energy_level: 'medicated' }), quest('b', { time_bucket: '30m', energy_level: 'meh' })]
    expect(ids(matchingQuests(mixed, { time: '30m', energy: 'meh' }))).toEqual(['b'])
  })
})

describe('Spec §5 Random Quest: what can be picked', () => {
  it('untagged quests (e.g. from quick capture) match any filter', () => {
    expect(ids(matchingQuests([quest('captured')], { time: '30m', energy: 'meh' }))).toEqual(['captured'])
  })
  it('accepted, done and deleted quests are never offered', () => {
    const qs = [quest('open'), quest('acc', { status: 'accepted' }), quest('done', { status: 'done' }), quest('del', { deleted_at: 'x' })]
    expect(ids(matchingQuests(qs))).toEqual(['open'])
  })
  it('returns nothing when no quest fits', () => {
    expect(pickQuest([quest('big', { time_bucket: 'full_day' })], { time: '30m' })).toBeNull()
  })
})

describe('Spec §5 Random Quest: the pick is random but skips the last 3 picked', () => {
  const qs = [
    quest('a', { last_picked_at: '2026-11-06T10:00:00Z' }),
    quest('b', { last_picked_at: '2026-11-06T11:00:00Z' }),
    quest('c', { last_picked_at: '2026-11-06T12:00:00Z' }),
    quest('d', { last_picked_at: '2026-11-01T09:00:00Z' }),
    quest('e'),
  ]

  it('the last 3 picked are a, b, c', () => expect([...recentlyPicked(qs)].sort()).toEqual(['a', 'b', 'c']))

  it('only d and e can come up, and the choice is random among them', () => {
    expect(pickQuest(qs, {}, () => 0)?.id).toBe('d')
    expect(pickQuest(qs, {}, () => 0.99)?.id).toBe('e')
  })

  it('if every match is recent, the least recently picked match is offered instead of nothing', () => {
    expect(pickQuest(qs.slice(0, 3), {}, () => 0)?.id).toBe('a')
  })

  it('re-rolling never shows the quest just picked when others fit', () => {
    let all = [quest('x'), quest('y'), quest('z'), quest('w')]
    let seen: string[] = []
    for (let i = 0; i < 4; i++) {
      const pick = pickQuest(all, {}, () => 0)!
      expect(seen.slice(-3)).not.toContain(pick.id)
      seen = [...seen, pick.id]
      all = all.map((q) => (q.id === pick.id ? markPicked(q, new Date(Date.UTC(2026, 10, 6, 12, i))) : q))
    }
    expect(new Set(seen).size).toBe(4)
  })
})

describe('Spec §5 Random Quest: accept, mark done, and pick history', () => {
  it('each pick counts toward times_picked and sets last_picked_at', () => {
    const q = markPicked(markPicked(quest('a'), new Date('2026-11-06T10:00:00Z')), new Date('2026-11-06T11:00:00Z'))
    expect(q).toMatchObject({ times_picked: 2, last_picked_at: '2026-11-06T11:00:00.000Z' })
  })
  it('accept moves a quest to in progress; mark done finishes it', () => {
    expect(acceptQuest(quest('a')).status).toBe('accepted')
    expect(finishQuest(quest('a')).status).toBe('done')
  })
})
