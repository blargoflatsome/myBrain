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
    <TitleField v-model="title" :label="m.editor.title" />
    <QuestFields v-model:energy="energy" v-model:time="time" v-model:details="details" />
  </EditorDialog>
</template>

<script setup lang="ts">
// Edit a quest: title, then the shared quest fields (QuestFields); Delete asks first (SPEC §2 Confirm before impact).
import EditorDialog from '@/components/EditorDialog.vue'
import { ref, watch } from 'vue'
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'
import { messages } from '@/messages'
import QuestFields from '@/quests/components/QuestFields.vue'
import TitleField from '@/components/TitleField.vue'
import { storedNotes } from '@/journal/body'

const props = withDefaults(defineProps<{ quest: QuestRow | null; isNew?: boolean }>(), { isNew: false })
const emit = defineEmits<{ save: [QuestRow]; delete: [QuestRow]; close: [] }>()
const m = messages.quests

const title = ref('')
const details = ref('')
const energy = ref<EnergyLevel | null>(null)
const time = ref<TimeBucket | null>(null)

watch(
  () => props.quest,
  (q) => {
    if (!q) return
    title.value = q.title
    details.value = q.details ?? ''
    energy.value = q.energy_level ?? null
    time.value = q.time_bucket ?? null
  },
)

async function save() {
  if (!props.quest || !title.value.trim()) return
  emit('save', {
    ...props.quest,
    title: title.value.trim(),
    details: storedNotes(details.value),
    energy_level: energy.value,
    time_bucket: time.value,
  })
}

function deleteNow() {
  if (props.quest) emit('delete', props.quest)
}

</script>
