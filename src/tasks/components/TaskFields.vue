<template>
  <!-- SPEC §5 Forms: a task's date, notes and priority, the same in Capture and the task editor. -->
  <DateInput :model-value="dueDate" :label="m.taskDateLabel" :hint="m.taskDateHint" :input-class="fieldClass" @update:model-value="emit('update:dueDate', $event)" />
  <NotesEditor :model-value="notes" :label="m.notesLabel" :test-id="notesTestId" @update:model-value="emit('update:notes', $event)" />
  <PriorityPicker :model-value="priority" @update:model-value="emit('update:priority', $event)" />
</template>

<script setup lang="ts">
// SPEC §5 Forms: the one task form (Capture and the task editor); the editor adds tags after it.
import DateInput from '@/components/DateInput.vue'
import NotesEditor from '@/components/NotesEditor.vue'
import PriorityPicker from '@/tasks/components/PriorityPicker.vue'
import { messages } from '@/messages'
import { field } from '@/ui/styles'

withDefaults(defineProps<{ dueDate: string; notes: string; priority: number; fieldClass?: string; notesTestId?: string }>(), { fieldClass: field, notesTestId: 'task-notes' })
const emit = defineEmits<{ 'update:dueDate': [value: string]; 'update:notes': [value: string]; 'update:priority': [value: number] }>()
const m = messages.capture
</script>
