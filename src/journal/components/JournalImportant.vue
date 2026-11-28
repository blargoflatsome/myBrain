<template>
  <button
    type="button"
    :class="rowToggle(on)"
    :aria-pressed="on"
    :aria-label="m.importantLabel(shortDay(date))"
    data-testid="journal-important"
    @click="toggle"
  >
    <AppIcon name="star" />{{ m.important }}
  </button>
</template>

<script setup lang="ts">
// SPEC §5 Journal: mark a day Important, to find it again with Search's Important journals filter.
import { ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import type { JournalEntryRow } from '@/sync/types'
import { shortDay } from '@/ui/dates'
import { rowToggle } from '@/ui/styles'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps<{ date: string; entry?: JournalEntryRow }>()
/** busy: the mark is being stored (for the journal's save status). */
const emit = defineEmits<{ busy: [on: boolean] }>()
const brain = useBrainStore()
const m = messages.journal

// Shown at once, before the save lands, so the press always answers (SPEC §2 Buttons answer every press).
const on = ref(!!props.entry?.important)
watch(
  () => props.entry?.important,
  (v) => (on.value = !!v),
)
async function toggle() {
  on.value = !on.value
  emit('busy', true)
  try {
    await brain.markJournalImportant(props.date, on.value)
  } finally {
    emit('busy', false)
  }
}
</script>
