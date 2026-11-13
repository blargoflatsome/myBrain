<template>
  <!-- SPEC §10 Scheduler: free, busy, maybe busy or unknown for the event's time. Words, not only colour (WCAG 1.4.1). -->
  <span v-if="status" :class="tone" data-testid="person-availability"> · {{ m.status[status] }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { messages } from '@/messages'
import type { Status } from '@/events/availability'

const props = defineProps<{ status: Status | undefined }>()
const m = messages.invites
const tone = computed(() => ({ free: 'text-accent', busy: 'text-danger', tentative: 'text-carried', unknown: 'text-muted' })[props.status ?? 'unknown'])
</script>
