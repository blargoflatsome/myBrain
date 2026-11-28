import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import JournalImportant from '@/journal/components/JournalImportant.vue'
import { useBrainStore } from '@/stores/brain'

beforeEach(() => setActivePinia(createPinia()))

describe('SPEC §5 Journal, Important days: the toggle', () => {
  it('goes back to how the day is really stored when marking it fails', async () => {
    const brain = useBrainStore()
    brain.markJournalImportant = vi.fn().mockRejectedValue(new Error('store failed'))
    const toggle = mount(JournalImportant, { props: { date: '2026-11-10' } })
    await toggle.get('[data-testid="journal-important"]').trigger('click')
    await flushPromises()
    expect(toggle.get('[data-testid="journal-important"]').attributes('aria-pressed')).toBe('false')
  })
})
