<template>
  <div class="flex flex-col gap-1">
    <label :class="fieldLabel">
      <span class="pb-2">{{ label }}</span>
      <input v-field-error="error" :value="modelValue" maxlength="500" required :class="field" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
    </label>
    <FieldError :of="error" />
  </div>
</template>

<script setup lang="ts">
// CODING_STANDARDS §6 Forms: an editor's title box, the same in every editor. Its editor refuses an empty title through
// `error` (SPEC §5 Forms, When a save is refused).
import FieldError from '@/components/FieldError.vue'
import { vFieldError, type FieldError as FieldErrorState } from '@/composables/useFieldError'
import { field, fieldLabel } from '@/ui/styles'

defineProps<{ label: string; modelValue: string; error: FieldErrorState }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
