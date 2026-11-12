<template>
  <EditorDialog
    :open="!!quest"
    :heading="isNew ? m.editor.newHeading : m.editor.heading"
    :save-label="m.editor.save"
    :close-label="m.editor.close"
    :delete-label="isNew ? null : m.editor.delete"
    @save="save"
    @delete="deleteNow"
    @close="emit('close')"
  >
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.editor.title }}</span>
      <input v-model="title" maxlength="500" required :class="field">
    </label>
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.editor.energy }}</span>
      <select v-model="energy" :class="field">
        <option value="">{{ m.editor.unset }}</option>
        <option v-for="e in ENERGY_LEVELS" :key="e" :value="e">{{ m.energy[e] }}</option>
      </select>
    </label>
    <label :class="fieldLabel">
      <span class="pb-2">{{ m.editor.time }}</span>
      <select v-model="time" :class="field">
        <option value="">{{ m.editor.unset }}</option>
        <option v-for="t in TIME_BUCKETS" :key="t" :value="t">{{ m.time[t] }}</option>
      </select>
    </label>
    <NotesEditor v-model="details" :label="m.editor.details" test-id="quest-details" />
  </EditorDialog>
</template>

<script setup lang="ts">
// Edit a quest: title, details, energy and time needed; Delete asks first (SPEC §2 Confirm before impact).
import EditorDialog from '@/components/EditorDialog.vue'
import { ref, watch } from 'vue'
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'
import { ENERGY_LEVELS, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'
import NotesEditor from '@/components/NotesEditor.vue'
import { storedNotes } from '@/journal/body'
import { field, fieldLabel } from '@/ui/styles'

const props = withDefaults(defineProps<{ quest: QuestRow | null; isNew?: boolean }>(), { isNew: false })
const emit = defineEmits<{ save: [QuestRow]; delete: [QuestRow]; close: [] }>()
const m = messages.quests

const title = ref('')
const details = ref('')
const energy = ref<EnergyLevel | ''>('')
const time = ref<TimeBucket | ''>('')

watch(
  () => props.quest,
  (q) => {
    if (!q) return
    title.value = q.title
    details.value = q.details ?? ''
    energy.value = q.energy_level ?? ''
    time.value = q.time_bucket ?? ''
  },
)

async function save() {
  if (!props.quest || !title.value.trim()) return
  emit('save', {
    ...props.quest,
    title: title.value.trim(),
    details: storedNotes(details.value),
    energy_level: energy.value || null,
    time_bucket: time.value || null,
  })
}

function deleteNow() {
  if (props.quest) emit('delete', props.quest)
}

</script>
