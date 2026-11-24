<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6"
    role="status"
    aria-live="polite"
    data-testid="undo-bar"
  >
    <div
      v-if="undo.current"
      ref="bar"
      :key="undo.current.id"
      class="pointer-events-auto flex max-w-md min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface py-2 pr-2 pl-4 text-ink shadow-lg"
      @mouseenter="undo.pause"
      @mouseleave="undo.resume"
      @focusin="undo.pause"
      @focusout="undo.resume"
      @keydown.esc.stop="close('dismiss')"
    >
      <span class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]" data-testid="undo-message">{{ undo.current.message }}</span>
      <button type="button" class="min-h-11 shrink-0 rounded-xl border border-accent px-4 font-semibold text-accent" data-testid="undo-button" @click="close('undo')">
        {{ undo.current.label ?? m.undo }}
      </button>
      <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted" :aria-label="m.dismiss" data-testid="undo-dismiss" @click="close('dismiss')">
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §2: the Undo bar shown for 8 seconds after removing one thing or clearing a list (also Cheers' quiet "Share it
// in Cheers?" offer, SPEC §5 Cheers). A polite live region, so
// screen readers hear it without being interrupted; it sits above the phone's tab bar and Capture button.
// Done from the keyboard, focus moves to the button so it can be reached in time; Escape closes the bar like ✕, and
// focus then lands where the page asked (its heading by default), since what I was on may be gone.
import { nextTick, ref, watch } from 'vue'
import { useUndoStore, type UndoOffer } from '@/stores/undo'
import { focusHere, focusPageHeading } from '@/a11y/focus'
import { messages } from '@/messages'

const undo = useUndoStore()
const m = messages.undo
const bar = ref<HTMLElement | null>(null)

watch(
  () => undo.current?.id,
  async () => {
    if (!undo.current?.byKeyboard) return
    await nextTick()
    bar.value?.querySelector<HTMLElement>('[data-testid="undo-button"]')?.focus()
  },
)

async function close(how: 'undo' | 'dismiss') {
  const offer = undo.current
  const hadFocus = !!bar.value?.contains(document.activeElement)
  if (how === 'undo') await undo.run()
  else undo.dismiss()
  if (hadFocus && offer) await land(offer)
}

async function land(offer: UndoOffer) {
  const target = await offer.focusAfter?.()
  if (target?.isConnected) focusHere(target)
  else focusPageHeading()
}
</script>
