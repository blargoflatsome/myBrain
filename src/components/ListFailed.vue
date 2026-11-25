<template>
  <!-- SPEC §7 Lists from the server: one that couldn't load says so, with Try again, instead of looking empty. -->
  <div class="flex flex-wrap items-center gap-2" data-testid="list-failed">
    <p class="text-sm text-danger" role="alert">{{ message ?? messages.serverList.failed }}</p>
    <button type="button" :class="smallButton" @click="emit('retry')">{{ messages.serverList.retry }}</button>
  </div>
</template>

<script setup lang="ts">
import { messages } from '@/messages'
import { smallButton } from '@/ui/styles'

defineProps<{ message?: string }>()
const emit = defineEmits<{ retry: [] }>()
</script>
