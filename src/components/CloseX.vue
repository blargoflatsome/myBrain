<template>
  <button
    type="button"
    class="close-x absolute top-2 right-2 z-10 flex size-11 items-center justify-center rounded-full text-xl text-muted hover:bg-bg hover:text-ink"
    :aria-label="label ?? messages.windows.close"
    data-testid="close-x"
  >
    <span aria-hidden="true">✕</span>
  </button>
</template>

<script setup lang="ts">
// SPEC §2 Windows: every window has a close ✕ in its top right corner. It sits last in the window's markup so the
// window's first field still gets focus when it opens; the click handler is the parent's (usually dialog.close()).
import { messages } from '@/messages'

defineProps<{ label?: string }>()
</script>
