import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { usePagination } from '@/composables/usePagination'

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

