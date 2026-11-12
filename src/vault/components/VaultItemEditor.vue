<template>
  <EditorDialog
    :open="!!item"
    :heading="m.itemEditor.heading"
    :save-label="m.itemEditor.save"
    :close-label="m.itemEditor.close"
    :delete-label="m.itemEditor.delete"
    @save="save"
    @delete="deleteNow"
    @close="emit('close')"
  >
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.itemEditor.title }}</span>
      <input v-model="title" maxlength="500" required :class="field">
    </label>
    <NotesEditor v-model="notes" :label="m.itemEditor.notes" test-id="vault-notes" />
    <MoreOptions :summary="m.itemEditor.moreSummary" :start-open="moreOpen" test-id="vault-more">
      <fieldset class="flex flex-col gap-1">
        <legend class="mb-1 text-sm text-muted pb-2">{{ m.itemEditor.rating }}</legend>
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
            <AppIcon name="star" :filled="!!rating && n <= rating" size="size-6" />
          </button>
          <button v-if="rating" type="button" class="ml-2 min-h-11 px-2 text-sm text-muted underline" @click="rating = null">
            {{ m.itemEditor.clearRating }}
          </button>
        </div>
      </fieldset>
      <label :class="fieldLabel">
        <span class="pb-2">{{ m.itemEditor.link }}</span>
        <input v-model="link" :class="field" autocomplete="off" inputmode="url">
        <span class="text-xs">{{ m.itemEditor.linkHint }}</span>
      </label>
      <label :class="fieldLabel">
        <span class="pb-2">{{ m.itemEditor.bucket }}</span>
        <select v-model="bucketId" :class="field">
          <option v-for="b in buckets" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
      </label>
    </MoreOptions>
  </EditorDialog>
</template>

<script setup lang="ts">
// SPEC §5 The Vault: edit an item: title, notes, star rating, link or address, bucket. Delete asks first.
import EditorDialog from '@/components/EditorDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import { ref, watch } from 'vue'
import { clampRating } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import MoreOptions from '@/components/MoreOptions.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import { storedNotes } from '@/journal/body'
import { field, fieldLabel } from '@/ui/styles'

const props = defineProps<{ item: VaultItemRow | null; buckets: VaultBucketRow[] }>()
const emit = defineEmits<{ save: [VaultItemRow]; delete: [VaultItemRow]; close: [] }>()
const m = messages.vault

const moreOpen = ref(false)
const title = ref('')
const notes = ref('')
const rating = ref<number | null>(null)
const link = ref('')
const bucketId = ref('')

watch(
  () => props.item,
  (i) => {
    if (!i) return
    title.value = i.title
    notes.value = i.notes ?? ''
    moreOpen.value = !!(i.rating || i.link)
    rating.value = i.rating ?? null
    link.value = i.link ?? ''
    bucketId.value = i.bucket_id
  },
)

async function save() {
  if (!props.item || !title.value.trim()) return
  emit('save', {
    ...props.item,
    title: title.value.trim(),
    notes: storedNotes(notes.value),
    rating: clampRating(rating.value),
    link: link.value.trim() || null,
    bucket_id: bucketId.value,
  })
}

function deleteNow() {
  if (props.item) emit('delete', props.item)
}

</script>
