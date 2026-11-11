<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
    <p v-if="!items.length" class="text-muted">{{ m.empty }}</p>
    <ul class="flex flex-col gap-4">
      <li v-for="item in items" :key="item.id" class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <p class="text-sm text-muted">{{ m.itemPrompt }}</p>
        <p class="text-lg whitespace-pre-wrap">{{ item.body }}</p>
        <DestinationPicker :allow-later="false" @choose="(c) => file(item, c)" />
      </li>
    </ul>
  </main>
</template>

<script setup lang="ts">
// SPEC §5: things saved with "Decide later" wait here until I sort them.
import DestinationPicker from '@/components/DestinationPicker.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { messages } from '@/messages'
import type { CaptureInput } from '@/capture/capture'
import type { InboxRow } from '@/sync/types'
import { live } from '@/sync/live'

const brain = useBrainStore()
const m = messages.inbox

const items = useLiveQuery<InboxRow[]>(
  async () => (brain.db ? live(await brain.db.inbox.toArray()) : []),
  [],
  [() => brain.db],
)

async function file(item: InboxRow, choice: Omit<CaptureInput, 'text'>) {
  await brain.convert({ table: 'inbox', row: item }, choice)
}
</script>
