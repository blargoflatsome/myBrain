<script setup lang="ts">
// SPEC §5 Journal: "How to make tomorrow better?" (saved as I type) and "Was today better than yesterday?" (Yes/No).
import { onScopeDispose, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import type { JournalEntryRow } from '@/sync/types'

const props = defineProps<{ date: string; entry?: JournalEntryRow }>()
const brain = useBrainStore()
const m = messages.journal

const tomorrow = ref(props.entry?.tomorrow ?? '')
const better = ref<boolean | null>(props.entry?.better_than_yesterday ?? null)
let typing = false
watch(
  () => props.entry,
  (e) => {
    if (!typing) tomorrow.value = e?.tomorrow ?? ''
    better.value = e?.better_than_yesterday ?? null
  },
)

let timer: ReturnType<typeof setTimeout> | undefined
function onTomorrow(value: string) {
  tomorrow.value = value
  typing = true
  clearTimeout(timer)
  timer = setTimeout(saveTomorrow, 800)
}
async function saveTomorrow() {
  clearTimeout(timer)
  typing = false
  if ((props.entry?.tomorrow ?? '') === tomorrow.value) return
  await brain.saveJournalFields(props.date, { tomorrow: tomorrow.value })
}
onScopeDispose(() => {
  if (typing) void saveTomorrow()
})
async function answer(value: boolean) {
  // Tapping the chosen answer again clears it.
  better.value = better.value === value ? null : value
  await brain.saveJournalFields(props.date, { better_than_yesterday: better.value })
}
const btn = (on: boolean) => ['min-h-11 flex-1 rounded-xl border px-3 font-semibold', on ? 'border-accent bg-accent text-accent-ink' : 'border-line']
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="journal-extras">
    <label class="flex flex-col gap-1 text-sm font-medium">
      {{ m.tomorrowLabel }}
      <textarea
        :value="tomorrow"
        rows="3"
        maxlength="5000"
        class="rounded-xl border border-line bg-surface px-3 py-2 text-base font-normal text-ink"
        @input="onTomorrow(($event.target as HTMLTextAreaElement).value)"
        @blur="saveTomorrow"
      />
    </label>
    <div class="flex flex-col gap-2">
      <span :id="`better-${date}`" class="text-sm font-medium">{{ m.betterLabel }}</span>
      <div class="flex gap-2" role="radiogroup" :aria-labelledby="`better-${date}`">
        <button type="button" role="radio" :aria-checked="better === true" :class="btn(better === true)" @click="answer(true)">{{ m.yes }}</button>
        <button type="button" role="radio" :aria-checked="better === false" :class="btn(better === false)" @click="answer(false)">{{ m.no }}</button>
      </div>
    </div>
  </div>
</template>
