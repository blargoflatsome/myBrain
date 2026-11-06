<script setup lang="ts">
// SPEC §5 Routines: the list of routines, today's progress, and completion stats.
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import RoutineEditor from '@/components/RoutineEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { activeSteps, isScheduled, percent, routineStats, runFor, runState } from '@/routines/rules'
import { messages } from '@/messages'
import type { RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'

const brain = useBrainStore()
const m = messages.routines
const { today } = useToday()

const routines = useLiveQuery<RoutineRow[]>(
  async () => (brain.db ? (await brain.db.routines.toArray()).filter((r) => !r.deleted_at) : []),
  [],
  [() => brain.db],
)
const steps = useLiveQuery<RoutineStepRow[]>(async () => (brain.db ? brain.db.routine_steps.toArray() : []), [], [() => brain.db])
const runs = useLiveQuery<RoutineRunRow[]>(async () => (brain.db ? brain.db.routine_runs.toArray() : []), [], [() => brain.db])
const logs = useLiveQuery<RoutineStepLogRow[]>(async () => (brain.db ? brain.db.routine_step_logs.toArray() : []), [], [() => brain.db])

const rows = computed(() =>
  routines.value.map((r) => {
    const s = activeSteps(steps.value, r.id)
    const state = runState(s, runFor(runs.value, r.id, today.value), logs.value)
    const stats = routineStats(r, steps.value, runs.value, logs.value, today.value)
    return { routine: r, steps: s, state, stats, scheduled: isScheduled(r, today.value) }
  }),
)

function statusText(row: (typeof rows.value)[number]) {
  if (!row.steps.length) return m.noSteps
  if (!row.scheduled) return m.notToday
  if (row.state.finished) return m.doneToday
  if (row.state.started) return m.progress(row.state.done, row.state.total)
  return m.notStarted
}

const expanded = ref<string | null>(null)
const editing = ref<RoutineRow | null>(null)
const isNew = ref(false)
const editingSteps = computed(() => (editing.value ? activeSteps(steps.value, editing.value.id) : []))

function startNew() {
  isNew.value = true
  editing.value = brain.newRoutine()
}
function edit(r: RoutineRow) {
  isNew.value = false
  editing.value = r
}
async function save(r: RoutineRow, s: { id?: string; title: string }[]) {
  await brain.saveRoutine(r, s)
  editing.value = null
}
async function remove(r: RoutineRow) {
  await brain.deleteRoutine(r.id)
  editing.value = null
}
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted italic">{{ m.intro }}</p>
    </div>

    <button type="button" class="min-h-12 self-start rounded-xl border border-line bg-surface px-4 font-medium" @click="startNew">{{ m.add }}</button>
    <p v-if="!routines.length" class="text-muted">{{ m.empty }}</p>

    <ul class="flex flex-col gap-3">
      <li v-for="row in rows" :key="row.routine.id" class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" :data-testid="`routine-${row.routine.id}`">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold break-words">{{ row.routine.title }}</h2>
            <p class="text-sm text-muted" data-testid="routine-status">{{ statusText(row) }}</p>
          </div>
          <button type="button" class="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm" @click="edit(row.routine)">{{ m.edit }}</button>
        </div>

        <RouterLink
          v-if="row.scheduled && row.steps.length && !row.state.finished"
          :to="`/routines/${row.routine.id}/run`"
          class="flex min-h-12 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-accent-ink"
        >
          {{ row.state.started ? m.continue : m.start }}
        </RouterLink>

        <button
          type="button"
          class="self-start text-left text-sm text-muted underline"
          :aria-expanded="expanded === row.routine.id"
          data-testid="routine-stats"
          @click="expanded = expanded === row.routine.id ? null : row.routine.id"
        >
          {{ row.stats.possible ? m.stats(row.stats.completed, row.stats.possible, percent(row.stats.completed, row.stats.possible)) : m.noHistory }}
        </button>
        <div v-if="expanded === row.routine.id && row.stats.steps.length" class="flex flex-col gap-1">
          <h3 class="text-sm font-semibold">{{ m.stepStatsHeading }}</h3>
          <ul class="flex flex-col gap-1 text-sm">
            <li v-for="s in row.stats.steps" :key="s.step.id" class="flex justify-between gap-3" data-testid="step-stat">
              <span>{{ s.step.title }}</span>
              <span class="text-muted">{{ m.stepStat(s.completed, s.possible, s.skipped) }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <RoutineEditor :routine="editing" :steps="editingSteps" :is-new="isNew" @save="save" @delete="remove" @close="editing = null" />
  </main>
</template>
