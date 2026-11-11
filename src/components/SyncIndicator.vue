<template>
  <p class="flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite" data-testid="sync-indicator">
    <span class="size-2 rounded-full" :class="view.dot" aria-hidden="true" />
    {{ view.text }}
  </p>
</template>

<script setup lang="ts">
// SPEC §7: a small online/offline/syncing indicator.
import { computed } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'

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
