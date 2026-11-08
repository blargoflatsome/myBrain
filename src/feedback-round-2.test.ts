import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { activeBuckets } from '@/vault/rules'
import { byEffort } from '@/quests/picker'
import { usePagination } from '@/composables/usePagination'
import type { QuestRow, VaultBucketRow } from '@/sync/types'

describe('Spec §5 The Vault: buckets are always favorites first, then A to Z', () => {
  it('starred buckets come first, each group sorted by name (ignoring case), deleted ones left out', () => {
    const b = (id: string, name: string, starred: boolean, extra: Partial<VaultBucketRow> = {}): VaultBucketRow => ({ id, name, position: 0, starred, deleted_at: null, ...extra })
    const out = activeBuckets([b('1', 'shopping', false), b('2', 'Zoo trips', true), b('3', 'Books', false), b('4', 'art', true), b('5', 'Gone', true, { deleted_at: 'x' })])
    expect(out.map((x) => x.name)).toEqual(['art', 'Zoo trips', 'Books', 'shopping'])
  })
})

describe('Spec §5 Random Quest: the list is sorted by effort', () => {
  it('easiest first, then shortest, then by title; quests without energy or time go last', () => {
    const q = (title: string, energy_level: string | null, time_bucket: string | null) => ({ id: title, title, energy_level, time_bucket }) as QuestRow
    const out = [q('Paint', 'medicated', '30m'), q('Walk', 'ugh', '2h'), q('Call', 'ugh', '30m'), q('Idea', null, null), q('Bake', 'fun', 'half_day'), q('Apples', 'ugh', '30m')].sort(byEffort)
    expect(out.map((x) => x.title)).toEqual(['Apples', 'Call', 'Walk', 'Bake', 'Paint', 'Idea'])
  })
})

describe('Spec §2 Long lists come in pages', () => {
  it('shows one page at a time and stays on a page that exists when the list shrinks', async () => {
    const items = ref(Array.from({ length: 23 }, (_, i) => i))
    const { page, pageCount, pageItems } = usePagination(items, 10)
    expect(pageCount.value).toBe(3)
    expect(pageItems.value).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    page.value = 3
    expect(pageItems.value).toEqual([20, 21, 22])
    items.value = items.value.slice(0, 12)
    await Promise.resolve()
    expect(page.value).toBe(2)
    expect(pageItems.value).toEqual([10, 11])
  })
})
