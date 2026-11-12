<template>
  <label :class="fieldLabel">
    <span class="pb-2">{{ label }}</span>
    <input :value="modelValue" maxlength="500" required :class="field" @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)">
  </label>
</template>

<script setup lang="ts">
// CODING_STANDARDS §6 Forms: an editor's title box, the same in every editor.
import { field, fieldLabel } from '@/ui/styles'

defineProps<{ label: string; modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>
