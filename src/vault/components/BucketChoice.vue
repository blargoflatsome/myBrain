<template>
  <!-- SPEC §5 Forms: which bucket, as chips for up to 10 buckets and a dropdown beyond that, with New bucket last. -->
  <div class="flex flex-col gap-2" data-testid="bucket-choice">
    <ChoiceChips v-if="buckets.length <= BUCKET_CHIPS_MAX" :label="m.bucketLabel" :options="choices" :model-value="chosen" @update:model-value="pick" />
    <label v-else :class="fieldLabel">
      <span class="pb-2">{{ m.bucketLabel }}</span>
      <select :value="chosen" :class="fieldClass" @change="pick(($event.target as HTMLSelectElement).value)">
        <option v-for="o in choices" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <input
      v-if="newName !== null"
      :value="newName"
      maxlength="200"
      :aria-label="m.newBucket"
      :placeholder="m.newBucket"
      :class="fieldClass"
      @input="emit('update:newName', ($event.target as HTMLInputElement).value)"
    >
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Forms: the one bucket choice, used by Capture, the Vault item editor and Orphans. Choosing New bucket shows
// a name box; the caller makes the bucket when it saves (`brain.createBucket`).
import { computed } from 'vue'
import ChoiceChips from '@/components/ChoiceChips.vue'
import type { VaultBucketRow } from '@/sync/types'
import { BUCKET_CHIPS_MAX } from '@/vault/rules'
import { messages } from '@/messages'
import { field, fieldLabel } from '@/ui/styles'

const props = withDefaults(
  defineProps<{ buckets: VaultBucketRow[]; bucketId: string | null; newName: string | null; fieldClass?: string }>(),
  { fieldClass: field },
)
const emit = defineEmits<{ 'update:bucketId': [id: string]; 'update:newName': [name: string | null] }>()
const m = messages.capture
const NEW = '+new'

const choices = computed(() => [...props.buckets.map((b) => ({ value: b.id, label: b.name })), { value: NEW, label: `+ ${m.newBucket}` }])
const chosen = computed(() => (props.newName !== null ? NEW : props.bucketId))
function pick(value: string) {
  if (value === NEW) {
    emit('update:newName', props.newName ?? '')
    return
  }
  emit('update:newName', null)
  emit('update:bucketId', value)
}
</script>
