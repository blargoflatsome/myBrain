<template>
  <nav v-if="pageCount > 1" class="flex items-center justify-between gap-3" :aria-label="label" data-testid="page-controls">
    <button type="button" :class="button" :disabled="page <= 1" @click="go(page - 1)">
      <span aria-hidden="true">‹</span> {{ m.previous }}
    </button>
    <span class="text-sm text-muted tabular-nums" aria-live="polite" data-testid="page-position">{{ m.position(page, pageCount) }}</span>
    <button type="button" :class="button" :disabled="page >= pageCount" @click="go(page + 1)">
      {{ m.next }} <span aria-hidden="true">›</span>
    </button>
  </nav>
</template>

<script setup lang="ts">
// SPEC §2 Long lists come in pages: Previous, "Page 2 of 5", Next. Use with usePagination().
import { messages } from '@/messages'

const props = defineProps<{ page: number; pageCount: number; label: string }>()
const emit = defineEmits<{ 'update:page': [page: number] }>()
const m = messages.pages

function go(to: number) {
  emit('update:page', Math.min(props.pageCount, Math.max(1, to)))
}
const button = 'flex min-h-11 items-center gap-1 rounded-xl border border-line bg-surface px-3 text-sm font-medium disabled:opacity-40'
</script>
