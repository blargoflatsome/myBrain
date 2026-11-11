<template>
  <details class="group rounded-xl border border-line" :open="startOpen" :data-testid="testId">
    <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
      <span class="min-w-0">
        {{ title ?? messages.forms.moreOptions }}
        <span v-if="summary" class="block text-xs font-normal text-muted">{{ summary }}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </summary>
    <div class="flex flex-col gap-4 border-t border-line p-3">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
// SPEC §5 Forms: optional details sit in a fold-out (a native disclosure, so keyboards and screen readers can open
// it). It starts open when something in it is already filled in, so nothing set is ever hidden.
import { messages } from '@/messages'

defineProps<{ title?: string; summary?: string; startOpen?: boolean; testId?: string }>()
</script>
