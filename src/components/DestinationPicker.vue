<template>
  <div class="flex flex-col gap-3">
    <template v-if="step === 'pick'">
      <div class="grid grid-cols-2 gap-3" role="group" :aria-label="m.whereHeading">
        <button
          v-for="d in order.filter((d) => props.allowLater || d !== 'later')"
          :key="d"
          type="button"
          :class="btn"
          :disabled="disabled"
          @click="pick(d)"
        >
          {{ m.destinations[d] }}
        </button>
      </div>
    </template>

    <template v-else-if="step === 'task'">
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.taskDateLabel }}
        <input v-model="dueDate" type="date" class="min-h-12 rounded-xl border border-line bg-surface px-3 text-base text-ink">
        <span class="text-xs">{{ m.taskDateHint }}</span>
      </label>
      <div class="flex gap-3">
        <button type="button" :class="btn" @click="reset">{{ m.back }}</button>
        <button type="button" :class="[primary, 'flex-1']" :disabled="disabled" @click="finish({ destination: 'task', dueDate: dueDate || null })">
          {{ m.saveTask }}
        </button>
      </div>
    </template>

    <template v-else>
      <p class="text-sm text-muted">{{ m.bucketLabel }}</p>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="m.bucketLabel">
        <button
          v-for="b in buckets"
          :key="b.id"
          type="button"
          :class="btn"
          :disabled="disabled"
          @click="finish({ destination: 'vault', bucketId: b.id })"
        >
          {{ b.name }}
        </button>
        <button v-if="!addingBucket" type="button" :class="[btn, 'border-dashed text-muted']" @click="addingBucket = true">
          + {{ m.newBucket }}
        </button>
      </div>
      <form v-if="addingBucket" class="flex gap-2" @submit.prevent="addBucket">
        <input
          v-model="newBucketName" maxlength="200"
          :aria-label="m.newBucket"
          class="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink"
          autofocus
        >
        <button type="submit" :class="primary" :disabled="disabled">{{ m.saveBucket }}</button>
      </form>
      <button type="button" :class="[btn, 'self-start']" @click="reset">{{ m.back }}</button>
    </template>
  </div>
</template>

<script setup lang="ts">
// SPEC §5: choose where a thought goes each time: Task (optional date), The Vault (bucket picker), Quest, or Decide later.
import { ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { messages } from '@/messages'
import type { CaptureInput, Destination } from '@/capture/capture'
import type { VaultBucketRow } from '@/sync/types'
import { activeBuckets } from '@/vault/rules'

const props = withDefaults(defineProps<{ allowLater?: boolean; disabled?: boolean }>(), { allowLater: true, disabled: false })
const emit = defineEmits<{ choose: [Omit<CaptureInput, 'text'>] }>()

const brain = useBrainStore()
const m = messages.capture
const step = ref<'pick' | 'task' | 'vault'>('pick')
const dueDate = ref('')
const newBucketName = ref('')
const addingBucket = ref(false)

const buckets = useLiveQuery<VaultBucketRow[]>(
  async () => (brain.db ? activeBuckets(await brain.db.vault_buckets.toArray()) : []),
  [],
  [() => brain.db],
)

const order: Destination[] = ['task', 'vault', 'quest', 'later']

function pick(d: Destination) {
  if (d === 'task') step.value = 'task'
  else if (d === 'vault') step.value = 'vault'
  else finish({ destination: d })
}

function finish(choice: Omit<CaptureInput, 'text'>) {
  emit('choose', choice)
}

async function addBucket() {
  if (!newBucketName.value.trim()) return
  const bucket = await brain.createBucket(newBucketName.value)
  newBucketName.value = ''
  addingBucket.value = false
  finish({ destination: 'vault', bucketId: bucket.id })
}

/** Called by the parent after a save, to start fresh. */
function reset() {
  step.value = 'pick'
  dueDate.value = ''
  addingBucket.value = false
  newBucketName.value = ''
}
defineExpose({ reset })

const btn =
  'min-h-12 rounded-xl border border-line bg-surface px-4 text-base font-medium text-ink active:scale-[0.98] disabled:opacity-50'
const primary = 'min-h-12 rounded-xl bg-accent px-4 text-base font-semibold text-accent-ink disabled:opacity-50'
</script>
