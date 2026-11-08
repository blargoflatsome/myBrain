<template>
  <dialog
    ref="dialog"
    :class="dialogBox"
    :aria-label="m.editor.heading"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4 p-5" @submit.prevent="save">
      <h2 class="text-lg font-semibold">{{ m.editor.heading }}</h2>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.title }}
        <input v-model="title" maxlength="500" required :class="field">
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.details }}
        <textarea v-model="details" maxlength="20000" rows="3" :class="[field, 'py-2']" />
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.energy }}
        <select v-model="energy" :class="field">
          <option value="">{{ m.editor.unset }}</option>
          <option v-for="e in ENERGY_LEVELS" :key="e" :value="e">{{ m.energy[e] }}</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 text-sm text-muted">
        {{ m.editor.time }}
        <select v-model="time" :class="field">
          <option value="">{{ m.editor.unset }}</option>
          <option v-for="t in TIME_BUCKETS" :key="t" :value="t">{{ m.time[t] }}</option>
        </select>
      </label>
      <TagInput v-model="tags.names.value" />
      <div class="flex gap-2">
        <button type="submit" class="min-h-12 flex-1 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.editor.save }}</button>
        <button type="button" class="min-h-12 rounded-xl border border-line px-4" @click="dialog?.close()">{{ m.editor.close }}</button>
      </div>
      <button type="button" class="self-start text-sm text-danger underline" @click="confirmDialog?.open()">
        {{ m.editor.delete }}
      </button>
    </form>
  </dialog>

  <ConfirmDialog
    ref="confirmDialog"
    :heading="m.confirmDelete.heading"
    :body="m.confirmDelete.body(quest?.title ?? '')"
    :confirm-label="m.confirmDelete.confirm"
    :keep-label="m.confirmDelete.keep"
    @confirm="confirmDelete"
  />
</template>

<script setup lang="ts">
// Edit a quest: title, details, energy and time needed; Delete asks first (SPEC §2 Confirm before impact).
import { computed, ref, watch } from 'vue'
import TagInput from '@/components/TagInput.vue'
import { useItemTags } from '@/composables/useItemTags'
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'
import { ENERGY_LEVELS, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { dialogBox, field } from '@/ui/styles'

const props = defineProps<{ quest: QuestRow | null }>()
const emit = defineEmits<{ save: [QuestRow]; delete: [QuestRow]; close: [] }>()
const m = messages.quests

const dialog = ref<HTMLDialogElement | null>(null)
const tags = useItemTags('quest', computed(() => props.quest?.id))
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const title = ref('')
const details = ref('')
const energy = ref<EnergyLevel | ''>('')
const time = ref<TimeBucket | ''>('')

watch(
  () => props.quest,
  (q) => {
    if (!q) return dialog.value?.close()
    title.value = q.title
    details.value = q.details ?? ''
    energy.value = q.energy_level ?? ''
    time.value = q.time_bucket ?? ''
    dialog.value?.showModal()
  },
)

async function save() {
  if (!props.quest || !title.value.trim()) return
  await tags.save(props.quest.id)
  emit('save', {
    ...props.quest,
    title: title.value.trim(),
    details: details.value.trim() || null,
    energy_level: energy.value || null,
    time_bucket: time.value || null,
  })
}

function confirmDelete() {
  if (props.quest) emit('delete', props.quest)
  confirmDialog.value?.close()
}

</script>
