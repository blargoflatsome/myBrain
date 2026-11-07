<script setup lang="ts">
// SPEC §5 Journal: "Was today better than yesterday?" Yes or No; tapping the chosen answer again clears it.
import { ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { messages } from '@/messages'
import type { JournalEntryRow } from '@/sync/types'

const props = defineProps<{ date: string; entry?: JournalEntryRow }>()
const brain = useBrainStore()
const m = messages.journal

const better = ref<boolean | null>(props.entry?.better_than_yesterday ?? null)
watch(
  () => props.entry?.better_than_yesterday,
  (v) => (better.value = v ?? null),
)
async function answer(value: boolean) {
  better.value = better.value === value ? null : value
  await brain.saveJournalFields(props.date, { better_than_yesterday: better.value })
}
const btn = (on: boolean) => ['min-h-11 flex-1 rounded-xl border px-3 font-semibold', on ? 'border-accent bg-accent text-accent-ink' : 'border-line']
</script>

<template>
  <div class="flex flex-col gap-2" data-testid="journal-better-question">
    <span :id="`better-${date}`" class="text-sm font-medium">{{ m.betterLabel }}</span>
    <div class="flex gap-2" role="radiogroup" :aria-labelledby="`better-${date}`">
      <button type="button" role="radio" :aria-checked="better === true" :class="btn(better === true)" @click="answer(true)">{{ m.yes }}</button>
      <button type="button" role="radio" :aria-checked="better === false" :class="btn(better === false)" @click="answer(false)">{{ m.no }}</button>
    </div>
  </div>
</template>
