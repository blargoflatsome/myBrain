<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-[calc(9rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 md:bottom-6"
    role="status"
    aria-live="polite"
    data-testid="undo-bar"
  >
    <div
      v-if="undo.current"
      :key="undo.current.id"
      class="pointer-events-auto flex max-w-md min-w-0 items-center gap-2 rounded-2xl border border-line bg-surface py-2 pr-2 pl-4 text-ink shadow-lg"
      @mouseenter="undo.pause"
      @mouseleave="undo.resume"
      @focusin="undo.pause"
      @focusout="undo.resume"
    >
      <span class="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]" data-testid="undo-message">{{ undo.current.message }}</span>
      <button type="button" class="min-h-11 shrink-0 rounded-xl border border-accent px-4 font-semibold text-accent" data-testid="undo-button" @click="undo.run()">
        {{ m.undo }}
      </button>
      <button type="button" class="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted" :aria-label="m.dismiss" @click="undo.dismiss()">
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// SPEC §2: the Undo bar shown for 8 seconds after removing one thing or clearing a list. A polite live region, so
// screen readers hear it without being interrupted; it sits above the phone's tab bar and Capture button.
import { useUndoStore } from '@/stores/undo'
import { messages } from '@/messages'

const undo = useUndoStore()
const m = messages.undo
</script>
