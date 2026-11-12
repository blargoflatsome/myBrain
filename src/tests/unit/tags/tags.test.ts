import { describe, expect, it } from 'vitest'
import type { ItemTagRow, TagRow } from '@/sync/types'
import { cleanTagName, itemTagIdFor, tagChanges, tagIdFor, tagsOf } from '@/tags/rules'

const UID = '11111111-2222-4333-8444-555555555555'

describe('Spec §5 Tags', () => {
  it('tag names are tidied, and the same name gives the same tag on every device (ignoring case)', () => {
    expect(cleanTagName('  road   trip ')).toBe('road trip')
    expect(tagIdFor(UID, 'Work')).toBe(tagIdFor(UID, 'work '))
    expect(tagIdFor(UID, 'Work')).not.toBe(tagIdFor(UID, 'home'))
    expect(tagIdFor(UID, 'Work')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(tagIdFor(UID, 'Work')).not.toBe(tagIdFor('99999999-2222-4333-8444-555555555555', 'Work'))
  })

  it('saving tag names creates new tags, adds missing links and removes dropped ones', () => {
    const work: TagRow = { id: tagIdFor(UID, 'work'), name: 'work', deleted_at: null }
    const old: TagRow = { id: tagIdFor(UID, 'old'), name: 'old', deleted_at: null }
    const link = (tag: TagRow): ItemTagRow => ({ id: itemTagIdFor('item-0000-0000-0000-000000000001', tag.id), tag_id: tag.id, item_type: 'task', item_id: 'item-0000-0000-0000-000000000001', deleted_at: null })
    const changes = tagChanges(UID, 'task', 'item-0000-0000-0000-000000000001', ['Work', 'Errands', ''], [work, old], [link(old)])
    expect(changes.newTags.map((t) => t.name)).toEqual(['Errands'])
    expect(changes.add.map((a) => a.tag_id).sort()).toEqual([work.id, tagIdFor(UID, 'Errands')].sort())
    expect(changes.remove.map((r) => r.tag_id)).toEqual([old.id])
    expect(tagsOf([link(old)], [work, old], 'task', 'item-0000-0000-0000-000000000001').map((t) => t.name)).toEqual(['old'])
  })
})

