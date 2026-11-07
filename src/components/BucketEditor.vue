<script setup lang="ts">
// SPEC §5 The Vault: rename a bucket, choose whether its items can be checked off, or delete it (with its items).
import { ref, watch } from 'vue'
import { messages } from '@/messages'
import type { VaultBucketRow } from '@/sync/types'

const props = defineProps<{ bucket: VaultBucketRow | null; itemCount: number }>()
const emit = defineEmits<{ save: [VaultBucketRow]; delete: [VaultBucketRow]; close: [] }>()
const m = messages.vault

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
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
const field = 'min-h-12 rounded-xl border border-line bg-bg px-3 text-base text-ink'
</script>

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
        <input v-model="name" required :class="field">
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
      <button type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.showModal()">
        {{ m.bucketEditor.delete }}
      </button>
    </form>
  </dialog>

  <dialog
    ref="confirmDialog"
    class="m-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
    role="alertdialog"
    :aria-label="m.confirmBucketDelete.heading"
  >
    <h2 class="text-lg font-semibold">{{ m.confirmBucketDelete.heading }}</h2>
    <p class="mt-2 text-muted">{{ m.confirmBucketDelete.body(bucket?.name ?? '', itemCount) }}</p>
    <div class="mt-4 flex gap-2">
      <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink" @click="confirmDelete">
        {{ m.confirmBucketDelete.confirm }}
      </button>
      <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmDialog?.close()">
        {{ m.confirmBucketDelete.keep }}
      </button>
    </div>
  </dialog>
</template>
