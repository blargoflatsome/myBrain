<template>
  <!-- SPEC §5 Forms: a quest's energy, time and details, the same in Capture and the quest editor. -->
  <ChoiceChips :label="m.editor.energy" :options="energyOptions" :model-value="energy" @update:model-value="emit('update:energy', $event)" />
  <ChoiceChips :label="m.editor.time" :options="timeOptions" :model-value="time" @update:model-value="emit('update:time', $event)" />
  <NotesEditor :model-value="details" :label="messages.capture.detailsLabel" :test-id="detailsTestId" @update:model-value="emit('update:details', $event)" />
</template>

<script setup lang="ts">
// SPEC §5 Forms: the one quest form (Capture and the quest editor).
import ChoiceChips from '@/components/ChoiceChips.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import type { EnergyLevel, TimeBucket } from '@/sync/types'
import { ENERGY_LEVELS, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'

withDefaults(defineProps<{ energy: EnergyLevel | null; time: TimeBucket | null; details: string; detailsTestId?: string }>(), { detailsTestId: 'quest-details' })
const emit = defineEmits<{ 'update:energy': [value: EnergyLevel]; 'update:time': [value: TimeBucket]; 'update:details': [value: string] }>()
const m = messages.quests
const energyOptions = ENERGY_LEVELS.map((e) => ({ value: e, label: m.energy[e] }))
const timeOptions = TIME_BUCKETS.map((t) => ({ value: t, label: m.time[t] }))
</script>
