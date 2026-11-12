// SPEC §5 Tags page: counts, rename, merge and delete rules.
import { describe, expect, it } from 'vitest'
import { itemTagIdFor, moveLinks, renameOutcome, tagIdFor, tagUsage } from '@/tags/rules'
import type { ItemTagRow, TaggedType, TagRow } from '@/sync/types'

const U = '11111111-1111-4111-8111-111111111111'
const tag = (name: string, extra: Partial<TagRow> = {}): TagRow => ({ id: tagIdFor(U, name), user_id: U, name, deleted_at: null, ...extra })
const link = (t: TagRow, type: TaggedType, itemId: string, extra: Partial<ItemTagRow> = {}): ItemTagRow => ({
  id: itemTagIdFor(itemId, t.id), user_id: U, tag_id: t.id, item_type: type, item_id: itemId, deleted_at: null, ...extra,
})
const ids = (task: string[] = [], habit: string[] = [], routine: string[] = []) => ({ task: new Set(task), habit: new Set(habit), routine: new Set(routine) })
const T1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const T2 = 'aaaaaaaa-0000-4000-8000-000000000002'
const H1 = 'bbbbbbbb-0000-4000-8000-000000000001'

describe('SPEC §5 Tags page: every tag A to Z with how many items it is on', () => {
  it('counts live tasks, habits and routines; skips deleted links, deleted items and deleted tags', () => {
    const chores = tag('chores')
    const money = tag('Money')
    const gone = tag('old', { deleted_at: '2026-11-01T00:00:00Z' })
    const uses = tagUsage(
      [money, chores, gone],
      [link(chores, 'task', T1), link(chores, 'task', T2), link(chores, 'habit', H1), link(money, 'task', T1, { deleted_at: '2026-11-02T00:00:00Z' }), link(chores, 'routine', 'deleted-routine')],
      ids([T1, T2], [H1]),
    )
    expect(uses.map((u) => u.tag.name)).toEqual(['chores', 'Money'])
    expect(uses[0]).toMatchObject({ total: 3, counts: { task: 2, habit: 1, routine: 0 } })
    expect(uses[1]).toMatchObject({ total: 0 })
  })
})

describe('SPEC §5 Tags page: merging moves every item to the other tag', () => {
  it('takes each item off the old tag and adds the new one, skipping items that already have it', () => {
    const a = tag('chores')
    const b = tag('house')
    const links = [link(a, 'task', T1), link(a, 'habit', H1), link(b, 'task', T1)]
    const { add, remove } = moveLinks(U, a.id, b.id, links)
    expect(remove.map((r) => r.id).sort()).toEqual([links[0].id, links[1].id].sort())
    expect(add).toEqual([{ id: itemTagIdFor(H1, b.id), user_id: U, tag_id: b.id, item_type: 'habit', item_id: H1, deleted_at: null }])
  })
})

describe('SPEC §5 Tags page: rename', () => {
  const chores = tag('Chores')
  const house = tag('house')
  it('a new name makes the tag for that name (its id comes from the name)', () => {
    expect(renameOutcome(U, chores, '  Jobs   around  ', [chores, house])).toEqual({
      kind: 'rename', name: 'Jobs around', newTag: { id: tagIdFor(U, 'jobs around'), user_id: U, name: 'Jobs around', deleted_at: null },
    })
  })
  it('only changing capitals keeps the same tag', () => {
    expect(renameOutcome(U, chores, 'chores', [chores])).toEqual({ kind: 'respell', name: 'chores' })
  })
  it('a name another tag has is a clash (offer to merge)', () => {
    expect(renameOutcome(U, chores, 'HOUSE', [chores, house])).toEqual({ kind: 'clash', other: house })
  })
  it('a deleted tag with that name is no clash', () => {
    expect(renameOutcome(U, chores, 'gone', [chores, tag('gone', { deleted_at: '2026-11-01T00:00:00Z' })]).kind).toBe('rename')
  })
  it('blank and unchanged names do nothing', () => {
    expect(renameOutcome(U, chores, '   ', [chores]).kind).toBe('empty')
    expect(renameOutcome(U, chores, 'Chores', [chores]).kind).toBe('unchanged')
  })
})
