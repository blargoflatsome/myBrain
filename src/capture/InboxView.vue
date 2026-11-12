<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
    <!-- SPEC §5 Celebrations: sorting the last orphan gets a friendly "all sorted". -->
    <div v-if="!current && sortedAll" class="flex items-center gap-4 rounded-2xl bg-surface p-6" role="status" data-testid="orphans-sorted">
      <span class="celebrate-fold flex size-12 shrink-0 items-center justify-center rounded-full bg-done text-bg" aria-hidden="true"><AppIcon name="check" size="size-7" /></span>
      <span class="text-lg font-medium">{{ messages.celebrations.orphansSorted }}</span>
    </div>
    <p v-else-if="!current" class="text-muted">{{ m.empty }}</p>

    <!-- SPEC §5 Orphans: one at a time, oldest first, like the routine run screen. -->
    <section v-else :key="current.id" class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" :aria-label="m.cardLabel" data-testid="orphan-card">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-muted" role="status" data-testid="orphan-position">{{ m.position(index + 1, queue.length) }}</p>
        <RowDelete :label="m.deleteLabel" @click="remove(current)" />
      </div>
      <p class="text-sm text-muted">{{ m.itemPrompt }}</p>
      <p class="text-lg break-words whitespace-pre-wrap" data-testid="orphan-body">{{ current.body }}</p>
      <DestinationPicker :allow-later="false" @choose="(c) => file(current!, c)" />
      <button v-if="queue.length > 1" type="button" :class="[smallButton, 'self-start']" data-testid="orphan-skip" @click="skip">
        {{ m.skip }}
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Orphans: things saved with "Decide later" wait here, shown one at a time until I file, delete or skip them.
import { computed, ref } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import RowDelete from '@/components/RowDelete.vue'
import DestinationPicker from '@/capture/components/DestinationPicker.vue'
import { useBrainStore } from '@/stores/brain'
import { useUndoStore } from '@/stores/undo'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { messages } from '@/messages'
import type { CaptureInput } from '@/capture/capture'
import type { InboxRow } from '@/sync/types'
import { live } from '@/sync/live'
import { oldestFirst } from '@/capture/capture'
import { smallButton } from '@/ui/styles'

const brain = useBrainStore()
const undo = useUndoStore()
const m = messages.inbox

const queue = useLiveQuery<InboxRow[]>(
  async () => (brain.db ? oldestFirst(live(await brain.db.inbox.toArray())) : []),
  [],
  [() => brain.db],
)

// Skip moves on to the next one; past the newest it comes round to the oldest again, so a skipped orphan waits at
// the back of the line. Only while I'm on this page: the next visit starts from the oldest.
const cursor = ref(0)
const index = computed(() => (queue.value.length ? cursor.value % queue.value.length : 0))
const current = computed<InboxRow | undefined>(() => queue.value[index.value])
function skip() {
  cursor.value = index.value + 1
}

const sortedAll = ref(false)
async function file(item: InboxRow, choice: Omit<CaptureInput, 'text'>) {
  const last = queue.value.length === 1
  await brain.convert({ table: 'inbox', row: item }, choice)
  if (last) sortedAll.value = true
}

async function remove(item: InboxRow) {
  const last = queue.value.length === 1
  await brain.removeOrphan(item.id)
  if (last) sortedAll.value = true
  undo.offer(messages.undo.deleted(preview(item.body)), () => brain.restore('inbox', item.id))
}

/** The start of an orphan's text, for the Undo bar. */
function preview(body: string) {
  const line = body.trim().split(/\r?\n/)[0] ?? ''
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line
}
</script>
