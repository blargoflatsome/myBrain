<template>
  <details class="group rounded-2xl border border-line bg-surface" :open="open" :data-testid="`account-group-${id}`" @toggle="onToggle">
    <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden [details[open]>&]:rounded-b-none [details[open]>&]:bg-accent/15" data-testid="fold-header">
      <span class="min-w-0">
        <h2 class="text-lg font-semibold">{{ title }}</h2>
        <span class="block text-sm text-muted">{{ summary }}</span>
      </span>
      <AppIcon name="chevronDown" size="size-5" class="text-muted transition-transform [details[open]>summary>&]:rotate-180" />
    </summary>
    <div class="flex flex-col gap-4 border-t border-line p-4">
      <slot />
    </div>
  </details>
</template>

<script setup lang="ts">
// SPEC §5 Account page: one group of settings that opens and closes (a native disclosure, so it works with a keyboard
// and screen readers). Which groups are open is remembered on this device; only Your profile starts open.
import AppIcon from '@/components/AppIcon.vue'
import { ref } from 'vue'
import { readJson, writeJson } from '@/ui/storage'

const props = defineProps<{ id: string; title: string; summary: string }>()
const KEY = 'my-brain:account-open'
const DEFAULT_OPEN = ['profile']

function readOpen(): string[] {
  const saved = readJson<string[]>(KEY)
  return Array.isArray(saved) ? saved : DEFAULT_OPEN
}
const open = ref(readOpen().includes(props.id))
function onToggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
  const now = new Set(readOpen())
  if (open.value) now.add(props.id)
  else now.delete(props.id)
  writeJson(KEY, [...now])
}
</script>
