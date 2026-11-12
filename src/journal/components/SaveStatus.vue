<template>
  <p v-if="state" class="flex items-center gap-1.5 text-sm text-muted" role="status" :data-testid="testId" :data-state="state">
    <svg aria-hidden="true" viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.3 1.5A3.75 3.75 0 0 1 17.25 18H7z" />
      <path v-if="state === 'saved'" d="M9.5 13.5l2 2 3.5-4" />
    </svg>
    <span :key="stamped ? 'stamp' : 'plain'" :class="{ 'celebrate-stamp': stamped }">{{ text }}</span>
  </p>
</template>

<script setup lang="ts">
// SPEC §5 Journal save status, like Google Docs: "Saving…" while writing is being stored, "Saved" once it's stored
// and uploaded, "Saved on this device" while it waits for a connection.
import { computed, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'

// stamp: "Saved" lands like a small stamp when the writing is saved (SPEC §5 Celebrations).
const props = withDefaults(defineProps<{ busy: boolean; hasSaved: boolean; testId?: string; stamp?: boolean }>(), { testId: 'save-status', stamp: false })
const brain = useBrainStore()
const m = messages.journal

const state = computed<'saving' | 'saved' | 'device' | null>(() => {
  if (props.busy) return 'saving'
  if (!props.hasSaved) return null
  if (brain.status.pending > 0) return !brain.online || brain.status.state === 'offline' ? 'device' : 'saving'
  return 'saved'
})
const stamped = ref(false)
watch(state, (now, before) => {
  stamped.value = props.stamp && now === 'saved' && before !== null && before !== 'saved'
})
const text = computed(() => (state.value === 'saving' ? m.saving : state.value === 'device' ? m.savedOnDevice : m.saved))
</script>
