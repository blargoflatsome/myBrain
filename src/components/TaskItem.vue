<script setup lang="ts">
// One task (SPEC §5 Tasks): cross off, priority dot, carry-over in red, Cancel/Edit after two carry-overs.
import { computed } from 'vue'
import type { TaskRow } from '@/sync/types'
import { carryOverCount, priorityKey } from '@/tasks/rules'
import { messages } from '@/messages'

const props = defineProps<{ task: TaskRow; today: string }>()
const emit = defineEmits<{ toggle: []; edit: []; cancel: [] }>()
const m = messages.tasks

const carried = computed(() => carryOverCount(props.task, props.today))
const done = computed(() => props.task.status === 'done')
const priority = computed(() => priorityKey(props.task.priority))
const dot = { high: 'bg-red-500', medium: 'bg-yellow-400', low: 'bg-green-500' } as const
</script>

<template>
  <li class="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3" :data-testid="`task-${task.id}`">
    <div class="flex items-start gap-3">
      <button
        type="button"
        class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-muted text-sm"
        :class="done ? 'border-accent bg-accent text-accent-ink' : ''"
        :aria-label="done ? m.uncross(task.title) : m.crossOff(task.title)"
        :aria-pressed="done"
        @click="emit('toggle')"
      >
        <span v-if="done" aria-hidden="true">✓</span>
      </button>
      <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="emit('edit')">
        <span
          class="text-base break-words transition-colors"
          :class="[done ? 'text-muted line-through' : '', carried && !done ? 'font-medium text-danger' : '']"
          data-testid="task-title"
        >
          {{ task.title }}
        </span>
        <span class="flex items-center gap-1.5 text-xs text-muted" data-testid="task-priority">
          <span class="size-2 rounded-full" :class="dot[priority]" aria-hidden="true" />
          {{ m.priority[priority] }}
        </span>
      </button>
    </div>
    <p v-if="carried === 1" class="text-sm text-muted">{{ m.carriedOnce }}</p>
    <template v-else-if="carried >= 2">
      <p class="text-sm text-muted">{{ m.carriedMany(carried) }}</p>
      <div class="flex gap-2">
        <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm font-medium" @click="emit('edit')">
          {{ m.edit }}
        </button>
        <button type="button" class="min-h-11 flex-1 rounded-xl border border-line px-3 text-sm font-medium" @click="emit('cancel')">
          {{ m.cancel }}
        </button>
      </div>
    </template>
  </li>
</template>
