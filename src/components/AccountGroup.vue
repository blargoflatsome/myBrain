<template>
  <details class="group rounded-2xl border border-line bg-surface" :open="open" :data-testid="`account-group-${id}`" @toggle="onToggle">
    <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
      <span class="min-w-0">
        <h2 class="text-lg font-semibold">{{ title }}</h2>
        <span class="block text-sm text-muted">{{ summary }}</span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </summary>
    <div class="flex flex-col gap-4 border-t border-line p-4">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
// SPEC §5 Account page: one group of settings that opens and closes (a native disclosure, so it works with a keyboard
// and screen readers). Which groups are open is remembered on this device; only Your profile starts open.
import { ref } from 'vue'

const props = defineProps<{ id: string; title: string; summary: string }>()
const KEY = 'my-brain:account-open'
const DEFAULT_OPEN = ['profile']

function readOpen(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as string[] | null
    return Array.isArray(saved) ? saved : DEFAULT_OPEN
  } catch {
    return DEFAULT_OPEN
  }
}
const open = ref(readOpen().includes(props.id))
function onToggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
  try {
    const now = new Set(readOpen())
    if (open.value) now.add(props.id)
    else now.delete(props.id)
    localStorage.setItem(KEY, JSON.stringify([...now]))
  } catch {
    // Storage blocked: it just won't be remembered.
  }
}
</script>
