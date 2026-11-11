<template>
  <p class="flex items-center gap-2 text-xs text-muted" :class="compact && 'min-h-11 min-w-6 justify-center'" :title="compact ? view.text : undefined" role="status" aria-live="polite" data-testid="sync-indicator">
    <span class="size-2.5 shrink-0 rounded-full" :class="view.dot" aria-hidden="true" />
    <span :class="compact && 'sr-only'">{{ view.text }}</span>
  </p>
</template>

<script setup lang="ts">
// SPEC §7: a small online/offline/syncing indicator.
import { computed } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'

// Compact (phones' header): the dot alone, with its words for screen readers and on hover (SPEC §2 Header).
defineProps<{ compact?: boolean }>()
const brain = useBrainStore()

const view = computed(() => {
  const { state, pending } = brain.status
  if (!brain.online || state === 'offline') {
    return { dot: 'bg-warning', text: pending ? `${messages.sync.offline} · ${messages.sync.pending(pending)}` : messages.sync.offline }
  }
  if (state === 'syncing') return { dot: 'bg-accent', text: messages.sync.syncing }
  if (pending) return { dot: 'bg-accent', text: messages.sync.pending(pending) }
  if (state === 'error') return { dot: 'bg-danger', text: messages.sync.pending(pending) }
  return { dot: 'bg-done', text: messages.sync.online }
})
</script>
