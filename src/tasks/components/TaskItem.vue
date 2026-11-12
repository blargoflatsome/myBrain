<template>
  <li class="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3" :data-testid="`task-${task.id}`">
    <div class="flex items-start gap-3">
      <CheckCircle :on="done" :draw-in="justDone" :label="done ? m.uncross(task.title) : m.crossOff(task.title)" data-testid="task-toggle" @click="emit('toggle')" />
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
      <RowDelete :label="m.deleteLabel(task.title)" @click="emit('delete')" />
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
// One task (SPEC §5 Tasks): cross off, priority dot, carry-over colour, the title opens the editor, the trash can
// deletes (SPEC §2 Rows look alike), Cancel task after two carry-overs.
import { computed, ref, watch } from 'vue'
import type { TaskRow } from '@/sync/types'
import { carryOverCount, needsDecision, priorityKey } from '@/tasks/rules'
import { messages } from '@/messages'
import { priorityDot, rowAction } from '@/ui/styles'
import CheckCircle from '@/components/CheckCircle.vue'
import RowDelete from '@/components/RowDelete.vue'

const props = defineProps<{ task: TaskRow; today: string }>()
const emit = defineEmits<{ toggle: []; edit: []; delete: []; cancel: [] }>()
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
