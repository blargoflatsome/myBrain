<template>
  <div class="flex flex-col items-start gap-2">
    <button type="button" :class="[primaryButton, 'min-h-14 px-6 text-lg']" :disabled="busy" data-testid="home-create" @click="emit('create')">
      {{ m.create }}
    </button>
    <p class="text-sm text-muted">{{ m.createNote }}</p>
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Home page: the Create a free account button, used in the opening section and again at the end.
import { messages } from '@/messages'
import { primaryButton } from '@/ui/styles'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ create: [] }>()
const m = messages.home
</script>
