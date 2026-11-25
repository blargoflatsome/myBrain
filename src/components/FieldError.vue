<template>
  <p v-if="of.message" :id="of.id" class="text-sm text-danger" data-testid="field-error">{{ of.message }}</p>
</template>

<script setup lang="ts">
// SPEC §5 Forms, When a save is refused: the message beside the field it's about. Not a live region: focus moving to
// the field reads it (useFieldError).
import type { FieldError } from '@/composables/useFieldError'

defineProps<{ of: FieldError }>()
</script>
