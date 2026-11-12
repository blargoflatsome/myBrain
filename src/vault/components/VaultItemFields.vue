<template>
  <!-- SPEC §5 Forms: a Vault item's bucket, notes, rating and link, the same in Capture and the item editor. -->
  <BucketChoice
    :buckets="buckets"
    :bucket-id="bucketId"
    :new-name="newBucketName"
    :field-class="fieldClass"
    @update:bucket-id="emit('update:bucketId', $event)"
    @update:new-name="emit('update:newBucketName', $event)"
  />
  <NotesEditor :model-value="notes" :label="messages.capture.notesLabel" :test-id="notesTestId" @update:model-value="emit('update:notes', $event)" />
  <MoreOptions :summary="m.moreSummary" :start-open="!!(rating || link)" test-id="vault-more">
    <fieldset class="flex flex-col gap-1">
      <legend class="mb-1 pb-2 text-sm text-muted">{{ m.rating }}</legend>
      <div class="flex items-center gap-1" role="radiogroup" :aria-label="m.rating">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          role="radio"
          class="flex size-11 items-center justify-center rounded-lg text-2xl"
          :class="rating && n <= rating ? 'text-star' : 'text-muted'"
          :aria-checked="rating === n"
          :aria-label="m.ratingStar(n)"
          @click="emit('update:rating', rating === n ? null : n)"
        >
          <AppIcon name="star" :filled="!!rating && n <= rating" size="size-6" />
        </button>
        <button v-if="rating" type="button" class="ml-2 min-h-11 px-2 text-sm text-muted underline" @click="emit('update:rating', null)">
          {{ m.clearRating }}
        </button>
      </div>
    </fieldset>
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.link }}</span>
      <input :value="link" :class="fieldClass" autocomplete="off" inputmode="url" @input="emit('update:link', ($event.target as HTMLInputElement).value)">
      <span class="text-xs">{{ m.linkHint }}</span>
    </label>
  </MoreOptions>
</template>

<script setup lang="ts">
// SPEC §5 Forms: the one Vault item form (Capture and the item editor): bucket, notes, then rating and link in More
// details.
import AppIcon from '@/components/AppIcon.vue'
import BucketChoice from '@/vault/components/BucketChoice.vue'
import MoreOptions from '@/components/MoreOptions.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import type { VaultBucketRow } from '@/sync/types'
import { messages } from '@/messages'
import { field, fieldLabel } from '@/ui/styles'

withDefaults(
  defineProps<{
    buckets: VaultBucketRow[]
    bucketId: string | null
    newBucketName: string | null
    notes: string
    rating: number | null
    link: string
    fieldClass?: string
    notesTestId?: string
  }>(),
  { fieldClass: field, notesTestId: 'vault-notes' },
)
const emit = defineEmits<{
  'update:bucketId': [id: string]
  'update:newBucketName': [name: string | null]
  'update:notes': [value: string]
  'update:rating': [value: number | null]
  'update:link': [value: string]
}>()
const m = messages.vault.itemEditor
</script>
