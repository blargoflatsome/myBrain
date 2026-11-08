<template>
  <div class="flex flex-col gap-1" data-testid="journal-tomorrow-box">
    <span class="text-sm font-medium">{{ m.tomorrowLabel }}</span>
    <RichTextEditor
      :model-value="draft ?? entry?.tomorrow ?? ''"
      :label="m.tomorrowLabel"
      min-height="6rem"
      @update:model-value="onInput"
      @blur="save"
    />
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Journal: "How to make tomorrow better?", formatted like the main writing, saved as I type.
import { defineAsyncComponent, onScopeDispose, ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { onPageHide } from '@/composables/usePageHide'
import { normalizeBody } from '@/journal/body'
import { messages } from '@/messages'
import type { JournalEntryRow } from '@/sync/types'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

const props = defineProps<{ date: string; entry?: JournalEntryRow }>()
const brain = useBrainStore()
const m = messages.journal

const draft = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
function onInput(value: string) {
  draft.value = value
  clearTimeout(timer)
  timer = setTimeout(save, 800)
}
async function save() {
  clearTimeout(timer)
  if (draft.value === null) return
  const value = normalizeBody(draft.value)
  if ((props.entry?.tomorrow ?? '') === value) return
  await brain.saveJournalFields(props.date, { tomorrow: value })
}
onPageHide(() => void save())
onScopeDispose(() => void save())
</script>
