<template>
  <details class="group rounded-xl border border-line" :open="startOpen" :data-testid="testId">
    <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden [details[open]>&]:rounded-b-none [details[open]>&]:bg-accent/15" data-testid="fold-header">
      <span class="min-w-0">
        {{ title ?? messages.forms.moreOptions }}
        <span v-if="summary" class="block text-xs font-normal text-muted">{{ summary }}</span>
      </span>
      <AppIcon name="chevronDown" size="size-5" class="text-muted transition-transform [details[open]>summary>&]:rotate-180" />
    </summary>
    <div class="flex flex-col gap-8 border-t border-line p-3">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
// SPEC §5 Forms: optional details sit in a fold-out (a native disclosure, so keyboards and screen readers can open
// it). It starts open when something in it is already filled in, so nothing set is ever hidden. An open one's header is
// tinted so it stands out from what's inside.
import AppIcon from '@/components/AppIcon.vue'
import { messages } from '@/messages'

defineProps<{ title?: string; summary?: string; startOpen?: boolean; testId?: string }>()
</script>
