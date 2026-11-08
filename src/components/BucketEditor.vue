<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(100%-2rem,28rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    :aria-label="m.bucketEditor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ m.bucketEditor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.bucketEditor.name }}
        <input v-model="name" maxlength="200" required :class="field">
      </label>
      <label class="flex items-center justify-between gap-4">
        <span>
          <span class="font-medium">{{ m.bucketEditor.checkable }}</span>
          <span class="block text-xs text-muted">{{ m.bucketEditor.checkableHint }}</span>
        </span>
        <input v-model="checkable" type="checkbox" class="size-5 shrink-0 accent-[var(--accent)]">
      </label>
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.bucketEditor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.bucketEditor.close }}</button>
      </div>
      <button type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">
        {{ m.bucketEditor.delete }}
      </button>
    </form>
  </dialog>

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
import { ref, watch } from 'vue'
import { messages } from '@/messages'
import type { VaultBucketRow } from '@/sync/types'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { field } from '@/ui/styles'

const props = defineProps<{ bucket: VaultBucketRow | null; itemCount: number }>()
const emit = defineEmits<{ save: [VaultBucketRow]; delete: [VaultBucketRow]; close: [] }>()
const m = messages.vault

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const name = ref('')
const checkable = ref(false)

watch(
  () => props.bucket,
  (b) => {
    if (!b) return dialog.value?.close()
    name.value = b.name
    checkable.value = !!b.checkable
    dialog.value?.showModal()
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
