<script setup lang="ts">
// SPEC §5 The Vault: edit an item: title, notes, star rating, link or address, bucket, tags. Delete asks first.
import { computed, ref, watch } from 'vue'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import { clampRating } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'

const props = defineProps<{ item: VaultItemRow | null; buckets: VaultBucketRow[] }>()
const emit = defineEmits<{ save: [VaultItemRow]; delete: [VaultItemRow]; close: [] }>()
const m = messages.vault

const dialog = ref<HTMLDialogElement | null>(null)
const confirmDialog = ref<HTMLDialogElement | null>(null)
const title = ref('')
const notes = ref('')
const rating = ref<number | null>(null)
const link = ref('')
const bucketId = ref('')
const tags = useItemTags('vault_item', computed(() => props.item?.id))

watch(
  () => props.item,
  (i) => {
    if (!i) return dialog.value?.close()
    title.value = i.title
    notes.value = i.notes ?? ''
    rating.value = i.rating ?? null
    link.value = i.link ?? ''
    bucketId.value = i.bucket_id
    dialog.value?.showModal()
  },
)

async function save() {
  if (!props.item || !title.value.trim()) return
  await tags.save(props.item.id)
  emit('save', {
    ...props.item,
    title: title.value.trim(),
    notes: notes.value.trim() || null,
    rating: clampRating(rating.value),
    link: link.value.trim() || null,
    bucket_id: bucketId.value,
  })
}

function confirmDelete() {
  if (props.item) emit('delete', props.item)
  confirmDialog.value?.close()
}

const field = 'min-h-12 rounded-xl border border-line bg-bg px-3 text-base text-ink'
</script>

<template>
  <dialog
    ref="dialog"
    class="m-auto w-[min(100%-2rem,32rem)] rounded-2xl border border-line bg-surface p-0 text-ink backdrop:bg-black/40"
    :aria-label="m.itemEditor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ m.itemEditor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.itemEditor.title }}
        <input v-model="title" maxlength="500" required :class="field">
      </label>
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-sm text-muted">{{ m.itemEditor.rating }}</legend>
        <div class="flex items-center gap-1" role="radiogroup" :aria-label="m.itemEditor.rating">
          <button
            v-for="n in 5"
            :key="n"
            type="button"
            role="radio"
            class="flex size-11 items-center justify-center rounded-lg text-2xl"
            :class="rating && n <= rating ? 'text-star' : 'text-muted'"
            :aria-checked="rating === n"
            :aria-label="m.itemEditor.ratingStar(n)"
            @click="rating = rating === n ? null : n"
          >
            ★
          </button>
          <button v-if="rating" type="button" class="ml-2 min-h-11 px-2 text-sm text-muted underline" @click="rating = null">
            {{ m.itemEditor.clearRating }}
          </button>
        </div>
      </fieldset>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.itemEditor.link }}
        <input v-model="link" :class="field" autocomplete="off" inputmode="url">
        <span class="text-xs">{{ m.itemEditor.linkHint }}</span>
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.itemEditor.notes }}
        <textarea v-model="notes" maxlength="20000" rows="3" :class="[field, 'py-2']" />
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.itemEditor.bucket }}
        <select v-model="bucketId" :class="field">
          <option v-for="b in buckets" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>
      <TagInput v-model="tags.names.value" />
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.itemEditor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.itemEditor.close }}</button>
      </div>
      <button type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.showModal()">
        {{ m.itemEditor.delete }}
      </button>
    </form>
  </dialog>

  <dialog
    ref="confirmDialog"
    class="m-auto w-[min(100%-2rem,24rem)] rounded-2xl border border-line bg-surface p-5 text-ink backdrop:bg-black/50"
    role="alertdialog"
    :aria-label="m.confirmItemDelete.heading"
  >
    <h2 class="text-lg font-semibold">{{ m.confirmItemDelete.heading }}</h2>
    <p class="mt-2 text-muted">{{ m.confirmItemDelete.body(item?.title ?? '') }}</p>
    <div class="mt-4 flex gap-2">
      <button type="button" class="min-h-12 flex-1 rounded-xl bg-danger px-4 font-semibold text-danger-ink" @click="confirmDelete">
        {{ m.confirmItemDelete.confirm }}
      </button>
      <button type="button" class="min-h-12 flex-1 rounded-xl border border-line px-4" @click="confirmDialog?.close()">
        {{ m.confirmItemDelete.keep }}
      </button>
    </div>
  </dialog>
</template>
