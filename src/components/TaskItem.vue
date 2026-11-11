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
        <svg v-if="done" aria-hidden="true" viewBox="0 0 24 24" class="size-4" :class="{ 'celebrate-draw': justDone }" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" data-testid="task-check">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
      <button type="button" class="flex min-w-0 flex-1 flex-col items-start gap-1 text-left" @click="emit('edit')">
        <span
          class="text-base break-words transition-colors"
          :class="[done ? 'text-muted line-through' : '', carried && !done ? 'font-medium text-carried' : '']"
          data-testid="task-title"
        >
          {{ task.title }}
        </span>
        <span class="flex items-center gap-1.5 text-xs text-muted" data-testid="task-priority">
          <span class="size-2 rounded-full" :class="dot[priority]" aria-hidden="true" />
          {{ m.priority[priority] }}
        </span>
      </button>
      <button type="button" :class="rowAction" :aria-label="m.editLabel(task.title)" data-testid="task-edit" @click="emit('edit')">
        <AppIcon name="pencil" />{{ m.edit }}
      </button>
    </div>
    <p v-if="carried === 1" class="text-sm text-muted">{{ m.carriedOnce }}</p>
    <template v-else-if="needsDecision(task, today)">
      <p class="text-sm text-muted">{{ m.carriedMany(carried) }}</p>
      <button type="button" :class="[rowAction, 'self-start']" @click="emit('cancel')">
        {{ m.cancel }}
      </button>
    </template>
  </li>
</template>

<script setup lang="ts">
// One task (SPEC §5 Tasks): cross off, priority dot, carry-over in red, Cancel/Edit after two carry-overs.
import { computed, ref, watch } from 'vue'
import type { TaskRow } from '@/sync/types'
import { carryOverCount, needsDecision, priorityKey } from '@/tasks/rules'
import { messages } from '@/messages'
import { priorityDot, rowAction } from '@/ui/styles'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps<{ task: TaskRow; today: string }>()
const emit = defineEmits<{ toggle: []; edit: []; cancel: [] }>()
const m = messages.tasks

const carried = computed(() => carryOverCount(props.task, props.today))
const done = computed(() => props.task.status === 'done')
// SPEC §5 Celebrations: the check mark draws itself in when I cross a task off.
const justDone = ref(false)
watch(done, (now, before) => {
  justDone.value = now && !before
})
const priority = computed(() => priorityKey(props.task.priority))
const dot = priorityDot
</script>
