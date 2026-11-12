<template>
  <fieldset class="flex flex-col gap-2" :data-testid="testId">
    <legend class="mb-1 pb-2 text-sm text-muted">{{ label }}</legend>
    <div class="flex flex-wrap gap-2 lg:gap-4">
      <button
        v-for="o in options"
        :key="String(o.value)"
        type="button"
        :class="chip(modelValue === o.value)"
        :aria-pressed="modelValue === o.value"
        @click="emit('update:modelValue', o.value)"
      >
        <slot name="option" :option="o">{{ o.label }}</slot>
      </button>
      <slot />
    </div>
  </fieldset>
</template>

<script setup lang="ts" generic="T extends string | number">
// CODING_STANDARDS §6 Forms: every short fixed choice (up to 10 options) is one row of chips, the chosen one tinted
// with a check mark. Capture, the editors and Orphans all use this; nothing draws its own chips.
import { chip } from '@/ui/styles'

defineProps<{ label: string; options: readonly { value: T; label: string }[]; modelValue: T | null; testId?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: T] }>()
</script>
