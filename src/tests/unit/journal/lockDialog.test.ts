import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import JournalLockDialog from '@/journal/components/JournalLockDialog.vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'

// Showing it's me is its own form, tested elsewhere: here it just hands over the journal key.
const ProvedAtOnce = defineComponent({
  emits: ['proved'],
  setup: (_, { emit }) => () => h('button', { 'data-testid': 'prove', onClick: () => emit('proved', new Uint8Array(32)) }),
})

const showModal = HTMLDialogElement.prototype.showModal
beforeEach(() => {
  setActivePinia(createPinia())
  // jsdom has no modal dialogs.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
})
afterEach(() => {
  HTMLDialogElement.prototype.showModal = showModal
})

describe('SPEC §5 Locking my journal: turning it off', () => {
  it('says so when it fails, and can be tried again', async () => {
    const brain = useBrainStore()
    brain.unlockJournalForGood = vi.fn().mockRejectedValue(new Error('store failed'))
    const dialog = mount(JournalLockDialog, { global: { stubs: { UnlockForm: ProvedAtOnce } }, attachTo: document.body })
    ;(dialog.vm as unknown as { open: (a: string) => void }).open('off')
    await nextTick()
    await dialog.get('[data-testid="prove"]').trigger('click')
    await flushPromises()

    await dialog.get('[data-testid="turn-off-confirm"]').trigger('click')
    await flushPromises()
    expect(dialog.get('[role="alert"]').text()).toBe(messages.journalLock.failed)
    expect(dialog.get('[data-testid="turn-off-confirm"]').attributes('disabled')).toBeUndefined()
    dialog.unmount()
  })
})
