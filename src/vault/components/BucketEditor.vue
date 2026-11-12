<template>
  <EditorDialog
    :open="!!bucket"
    :heading="m.bucketEditor.heading"
    :save-label="m.bucketEditor.save"
    :close-label="m.bucketEditor.close"
    :delete-label="m.bucketEditor.delete"
    box-class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    @save="save"
    @delete="confirmDialog?.open()"
    @close="emit('close')"
  >
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.bucketEditor.name }}</span>
      <input v-model="name" maxlength="200" required :class="field">
    </label>
    <label class="flex items-center justify-between gap-4">
      <span>
        <span class="font-medium">{{ m.bucketEditor.checkable }}</span>
        <span class="block text-xs text-muted">{{ m.bucketEditor.checkableHint }}</span>
      </span>
      <input v-model="checkable" type="checkbox" :class="checkbox">
    </label>
  </EditorDialog>

  <ConfirmDialog
    ref="confirmDialog"
    :heading="m.confirmBucketDelete.heading"
    :body="m.confirmBucketDelete.body(bucket?.name ?? '', itemCount)"
    :confirm-label="m.confirmBucketDelete.confirm"
    :keep-label="m.confirmBucketDelete.keep"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
// SPEC §5 The Vault: rename a bucket, choose whether its items can be checked off, or delete it (with its items).
import EditorDialog from '@/components/EditorDialog.vue'
import { ref, watch } from 'vue'
import { messages } from '@/messages'
import type { VaultBucketRow } from '@/sync/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { checkbox, field, fieldLabel } from '@/ui/styles'

const props = defineProps<{ bucket: VaultBucketRow | null; itemCount: number }>()
const emit = defineEmits<{ save: [VaultBucketRow]; delete: [VaultBucketRow]; close: [] }>()
const m = messages.vault

const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const name = ref('')
const checkable = ref(false)

watch(
  () => props.bucket,
  (b) => {
    if (!b) return
    name.value = b.name
    checkable.value = !!b.checkable
  },
)

function save() {
  if (!props.bucket || !name.value.trim()) return
  emit('save', { ...props.bucket, name: name.value.trim(), checkable: checkable.value })
}
function confirmDelete() {
  if (props.bucket) emit('delete', props.bucket)
  confirmDialog.value?.close()
}
</script>
