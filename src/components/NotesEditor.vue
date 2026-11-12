<template>
  <div class="flex flex-col gap-1" :data-testid="testId">
    <span class="pb-2 text-sm text-muted">{{ label }}</span>
    <RichTextEditor :model-value="modelValue" :label="label" :min-height="minHeight" @update:model-value="emit('update:modelValue', $event)" />
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Formatted notes: task notes, Vault notes, quest details, priority task descriptions and event notes use the
// journal's editor (smaller). The editor loads on first use, like the journal's (docs/CODING_STANDARDS.md §10).
import { defineAsyncComponent } from 'vue'

withDefaults(defineProps<{ modelValue: string; label: string; minHeight?: string; testId?: string }>(), { minHeight: '5rem', testId: undefined })
const emit = defineEmits<{ 'update:modelValue': [html: string] }>()
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))
</script>
