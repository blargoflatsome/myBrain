<template>
  <EditorDialog
    :open="!!item"
    :heading="isNew ? m.itemEditor.newHeading : m.itemEditor.heading"
    :save-label="m.itemEditor.save"
    :close-label="m.itemEditor.close"
    :delete-label="isNew ? null : m.itemEditor.delete"
    @save="save"
    @delete="deleteNow"
    @close="emit('close')"
  >
    <TitleField v-model="title" :label="m.itemEditor.title" />
    <VaultItemFields
      v-model:bucket-id="bucketId"
      v-model:new-bucket-name="newBucketName"
      v-model:notes="notes"
      v-model:rating="rating"
      v-model:link="link"
      :buckets="buckets"
    />
  </EditorDialog>
</template>

<script setup lang="ts">
// SPEC §5 The Vault: edit an item: title, then the shared Vault item fields (VaultItemFields). Delete asks first.
import EditorDialog from '@/components/EditorDialog.vue'
import TitleField from '@/components/TitleField.vue'
import VaultItemFields from '@/vault/components/VaultItemFields.vue'
import { useBrainStore } from '@/stores/brain'
import { ref, watch } from 'vue'
import { clampRating } from '@/vault/rules'
import { messages } from '@/messages'
import type { VaultBucketRow, VaultItemRow } from '@/sync/types'
import { storedNotes } from '@/journal/body'

const props = withDefaults(defineProps<{ item: VaultItemRow | null; buckets: VaultBucketRow[]; isNew?: boolean }>(), { isNew: false })
const emit = defineEmits<{ save: [VaultItemRow]; delete: [VaultItemRow]; close: [] }>()
const m = messages.vault

const brain = useBrainStore()
const newBucketName = ref<string | null>(null)
const title = ref('')
const notes = ref('')
const rating = ref<number | null>(null)
const link = ref('')
const bucketId = ref<string | null>(null)

watch(
  () => props.item,
  (i) => {
    if (!i) return
    title.value = i.title
    notes.value = i.notes ?? ''
    newBucketName.value = null
    rating.value = i.rating ?? null
    link.value = i.link ?? ''
    bucketId.value = i.bucket_id
  },
)

async function save() {
  if (!props.item || !title.value.trim()) return
  // A new bucket chosen in the form is made when the item is saved (SPEC §5 Forms).
  if (newBucketName.value?.trim()) bucketId.value = (await brain.createBucket(newBucketName.value)).id
  emit('save', {
    ...props.item,
    title: title.value.trim(),
    notes: storedNotes(notes.value),
    rating: clampRating(rating.value),
    link: link.value.trim() || null,
    bucket_id: bucketId.value ?? props.item.bucket_id,
  })
}

function deleteNow() {
  if (props.item) emit('delete', props.item)
}

</script>
