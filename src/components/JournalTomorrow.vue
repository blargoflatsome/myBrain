<template>
  <div class="flex flex-col gap-1" data-testid="journal-tomorrow-box">
    <span class="text-sm font-medium">{{ m.tomorrowLabel }}</span>
    <RichTextEditor
      :model-value="draft ?? entry?.tomorrow ?? ''"
      :label="m.tomorrowLabel"
      :min-height="minHeight"
      @update:model-value="onInput"
      @blur="save"
    />
    <!-- Also right under the box, so it's visible on a phone while typing here (SPEC §5 Journal). -->
    <SaveStatus :busy="busy" :has-saved="!!entry?.tomorrow" test-id="save-status-tomorrow" />
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Journal: "How to make tomorrow better?", formatted like the main writing, saved as I type.
import { defineAsyncComponent, onScopeDispose, ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import SaveStatus from '@/components/SaveStatus.vue'
import { onPageHide } from '@/composables/usePageHide'
import { normalizeBody } from '@/journal/body'
import { messages } from '@/messages'
import type { JournalEntryRow } from '@/sync/types'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

// The same size as the day's writing box above it (SPEC §5 Journal).
const props = withDefaults(defineProps<{ date: string; entry?: JournalEntryRow; minHeight?: string }>(), { entry: undefined, minHeight: '18rem' })
/** busy: there's writing waiting to be stored (for the journal's save status). */
const emit = defineEmits<{ busy: [on: boolean] }>()
const brain = useBrainStore()
const m = messages.journal

const draft = ref<string | null>(null)
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function onInput(value: string) {
  draft.value = value
  emit('busy', true)
  busy.value = true
  clearTimeout(timer)
  timer = setTimeout(save, 800)
}
async function save() {
  clearTimeout(timer)
  if (draft.value === null) return
  const value = normalizeBody(draft.value)
  if ((props.entry?.tomorrow ?? '') !== value) await brain.saveJournalFields(props.date, { tomorrow: value })
  emit('busy', false)
  busy.value = false
}
onPageHide(() => void save())
onScopeDispose(() => void save())
</script>
