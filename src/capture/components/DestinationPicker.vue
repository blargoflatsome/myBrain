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
      <DateInput v-model="dueDate" :label="m.taskDateLabel" :hint="m.taskDateHint" :input-class="fieldOnPage" />
      <div class="flex gap-3">
        <button type="button" :class="btn" @click="reset">{{ m.back }}</button>
        <button type="button" :class="[primary, 'flex-1']" :disabled="disabled" @click="finish({ destination: 'task', dueDate: dueDate || null })">
          {{ m.saveTask }}
        </button>
      </div>
    </template>

    <template v-else>
      <BucketChoice v-model:bucket-id="bucketId" v-model:new-name="newBucketName" :buckets="buckets" :field-class="fieldOnPage" />
      <div class="flex gap-3">
        <button type="button" :class="btn" @click="reset">{{ m.back }}</button>
        <button type="button" :class="[primary, 'flex-1']" :disabled="disabled || (!bucketId && !newBucketName?.trim())" @click="fileToVault">
          {{ m.saveAs.vault }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Orphans: where a thought goes: Task (optional date), The Vault (bucket picker), Quest, Habit, Post It, or Decide later.
import { ref, watch } from 'vue'
import BucketChoice from '@/vault/components/BucketChoice.vue'
import DateInput from '@/components/DateInput.vue'
import { fieldOnPage, primaryButton, secondaryButton } from '@/ui/styles'
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
const newBucketName = ref<string | null>(null)
const bucketId = ref<string | null>(null)

const buckets = useLiveQuery<VaultBucketRow[]>(
  async () => (brain.db ? activeBuckets(await brain.db.vault_buckets.toArray()) : []),
  [],
  [() => brain.db],
)
// The first bucket is preselected, as in Capture (SPEC §5 Forms).
watch(buckets, (list) => {
  if (!bucketId.value || !list.some((b) => b.id === bucketId.value)) bucketId.value = list[0]?.id ?? null
})

const order: Destination[] = ['task', 'vault', 'quest', 'habit', 'postit', 'later']

function pick(d: Destination) {
  if (d === 'task') step.value = 'task'
  else if (d === 'vault') step.value = 'vault'
  else finish({ destination: d })
}

function finish(choice: Omit<CaptureInput, 'text'>) {
  emit('choose', choice)
}

async function fileToVault() {
  const id = newBucketName.value?.trim() ? (await brain.createBucket(newBucketName.value)).id : bucketId.value
  if (id) finish({ destination: 'vault', bucketId: id })
}

/** Called by the parent after a save, to start fresh. */
function reset() {
  step.value = 'pick'
  dueDate.value = ''
  newBucketName.value = null
}
defineExpose({ reset })

const btn = [secondaryButton, 'bg-surface font-medium disabled:opacity-50']
const primary = [primaryButton, 'disabled:opacity-50']
</script>
