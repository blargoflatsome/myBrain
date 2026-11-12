import { describe, expect, it } from 'vitest'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import { checkedItems, clampRating, itemsInBucket, linkLabel, linkTarget } from '@/vault/rules'

describe('Spec §5 The Vault', () => {
  const list: VaultBucketRow = { id: 'b1', name: 'Shopping list', position: 0, checkable: true, deleted_at: null }
  const reviews: VaultBucketRow = { id: 'b2', name: 'Restaurant reviews', position: 1, checkable: false, deleted_at: null }
  const item = (id: string, extra: Partial<VaultItemRow> = {}): VaultItemRow => ({ id, bucket_id: 'b1', title: id, created_at: `2026-11-0${id.slice(-1)}`, deleted_at: null, ...extra })

  it('items are shown in the order added; in a checklist bucket checked items go to the bottom', () => {
    const items = [item('i3'), item('i1', { checked: true }), item('i2'), item('i4', { deleted_at: 'x' }), item('i5', { bucket_id: 'b2' })]
    expect(itemsInBucket(items, list).map((i) => i.id)).toEqual(['i2', 'i3', 'i1'])
    expect(checkedItems(items, list).map((i) => i.id)).toEqual(['i1'])
    expect(checkedItems(items, reviews)).toEqual([])
  })

  it('a web address opens as is; anything else opens in maps', () => {
    expect(linkTarget('https://example.com/menu')).toEqual({ href: 'https://example.com/menu', kind: 'web' })
    expect(linkTarget('example.com')).toEqual({ href: 'https://example.com', kind: 'web' })
    expect(linkTarget('12 High St, Springfield')).toEqual({
      href: 'https://www.google.com/maps/search/?api=1&query=12%20High%20St%2C%20Springfield',
      kind: 'map',
    })
    expect(linkLabel('https://www.example.com/menu')).toBe('example.com')
    expect(linkLabel('12 High St')).toBe('12 High St')
  })

  it('star ratings are 1 to 5, or none', () => {
    expect(clampRating(0)).toBeNull()
    expect(clampRating(7)).toBe(5)
    expect(clampRating(3)).toBe(3)
  })
})

