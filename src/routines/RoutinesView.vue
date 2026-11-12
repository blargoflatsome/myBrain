<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <PageHeading :heading="m.heading" :intro="m.intro">
      <NewButton :label="m.add" data-testid="new-routine" @click="startNew" />
    </PageHeading>
    <p v-if="!routines.length" class="text-muted">{{ m.empty }}</p>

    <ul class="flex flex-col gap-3">
      <li v-for="row in rows" :key="row.routine.id" class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4" :data-testid="`routine-${row.routine.id}`">
        <div class="-mr-2 flex items-start gap-1">
          <button type="button" class="min-w-0 flex-1 text-left" @click="edit(row.routine)">
            <h2 class="text-lg font-semibold break-words">{{ row.routine.title }}</h2>
            <p class="text-sm text-muted" data-testid="routine-status">{{ statusText(row) }}</p>
          </button>
          <RowDelete :label="m.deleteLabel(row.routine.title)" @click="askDelete(row.routine)" />
        </div>

        <RouterLink
          v-if="row.scheduled && row.steps.length && (!row.state.finished || row.skipped)"
          :to="`/routines/${row.routine.id}/run`"
          class="flex items-center justify-center" :class="primaryButton"
        >
          {{ row.skipped ? m.resume : row.state.started ? m.continue : m.start }}
        </RouterLink>

        <button
          type="button"
          class="self-start text-left text-sm text-muted underline"
          :aria-expanded="expanded === row.routine.id"
          data-testid="routine-stats"
          @click="expanded = expanded === row.routine.id ? null : row.routine.id"
        >
          {{
            row.anytime
              ? m.finishedTimes(row.stats.completed)
              : row.stats.possible
                ? m.stats(row.stats.completed, row.stats.possible, percent(row.stats.completed, row.stats.possible))
                : m.noHistory
          }}
        </button>
        <div v-if="expanded === row.routine.id && row.stats.steps.length" class="flex flex-col gap-1">
          <h3 class="text-sm font-semibold">{{ m.stepStatsHeading }}</h3>
          <ul class="flex flex-col gap-1 text-sm">
            <li v-for="s in row.stats.steps" :key="s.step.id" class="flex justify-between gap-3" data-testid="step-stat">
              <span>{{ habitOf(s.step, habits)?.title ?? s.step.title }}</span>
              <span class="text-muted">{{ m.stepStat(s.completed, s.possible, s.skipped) }}</span>
            </li>
          </ul>
        </div>
      </li>
    </ul>

    <RoutineEditor :routine="editing" :steps="editingSteps" :is-new="isNew" @save="save" @delete="remove" @close="editing = null" />
    <!-- SPEC §2 Confirm before impact: a routine goes with its history, so the row's trash can asks first. -->
    <ConfirmDialog
      ref="confirmDialog"
      :heading="m.confirmDelete.heading"
      :body="m.confirmDelete.body(deleting?.title ?? '')"
      :confirm-label="m.confirmDelete.confirm"
      :keep-label="m.confirmDelete.keep"
      @confirm="deleting && remove(deleting)"
    />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Routines: the list of routines, today's progress, and completion stats.
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import RoutineEditor from '@/routines/components/RoutineEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { activeSteps, currentRun, habitDoneStepIds, habitOf, isAnytime, isScheduled, percent, resumableRun, routineStats, runState, skippedSteps, stepsForDay } from '@/routines/rules'
import { messages } from '@/messages'
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { live } from '@/sync/live'
import { primaryButton } from '@/ui/styles'
import PageHeading from '@/components/PageHeading.vue'
import NewButton from '@/components/NewButton.vue'
import RowDelete from '@/components/RowDelete.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const brain = useBrainStore()
const m = messages.routines
const { today } = useToday()

const routines = useLiveQuery<RoutineRow[]>(
  async () => (brain.db ? live(await brain.db.routines.toArray()) : []),
  [],
  [() => brain.db],
)
const steps = useLiveQuery<RoutineStepRow[]>(async () => (brain.db ? brain.db.routine_steps.toArray() : []), [], [() => brain.db])
const runs = useLiveQuery<RoutineRunRow[]>(async () => (brain.db ? brain.db.routine_runs.toArray() : []), [], [() => brain.db])
const logs = useLiveQuery<RoutineStepLogRow[]>(async () => (brain.db ? brain.db.routine_step_logs.toArray() : []), [], [() => brain.db])

const habits = useLiveQuery<HabitRow[]>(async () => (brain.db ? brain.db.habits.toArray() : []), [], [() => brain.db])
const habitLogs = useLiveQuery<HabitLogRow[]>(async () => (brain.db ? brain.db.habit_logs.toArray() : []), [], [() => brain.db])

const rows = computed(() =>
  routines.value.map((r) => {
    const s = stepsForDay(activeSteps(steps.value, r.id), habits.value, today.value)
    const habitDone = habitDoneStepIds(s, habitLogs.value, today.value)
    const state = runState(s, currentRun(r, runs.value, today.value), logs.value, habitDone)
    // Steps skipped in a finished run: the row offers Resume to do just those (SPEC §5 Routines).
    const skipped = skippedSteps(s, resumableRun(r, runs.value, today.value), logs.value, habitDone).length
    const stats = routineStats(r, steps.value, runs.value, logs.value, today.value, habits.value)
    const anytime = isAnytime(r)
    // A run-anytime routine can always be started (SPEC §5 Routines).
    return { routine: r, steps: s, state, skipped, stats, anytime, scheduled: anytime || isScheduled(r, today.value) }
  }),
)

function statusText(row: (typeof rows.value)[number]) {
  if (!row.steps.length) return m.noSteps
  if (row.anytime) return row.state.started ? m.progress(row.state.done, row.state.total) : row.skipped ? m.finishedSkipped(row.skipped) : m.anytime
  if (!row.scheduled) return m.notToday
  if (row.state.finished) return row.skipped ? m.doneSkipped(row.skipped) : m.doneToday
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
// Opened with ?routine=<id> (from search): open that routine's editor.
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.routine, routines],
  ([id]) => {
    if (typeof id !== 'string') return
    const found = routines.value.find((x) => x.id === id && !x.deleted_at)
    if (!found) return
    edit(found)
    void router.replace({ query: {} })
  },
  { immediate: true },
)
async function save(r: RoutineRow, s: { id?: string; title: string; habitId?: string | null }[]) {
  await brain.saveRoutine(r, s)
  editing.value = null
}
async function remove(r: RoutineRow) {
  await brain.deleteRoutine(r.id)
  confirmDialog.value?.close()
  if (editing.value?.id === r.id) editing.value = null
  deleting.value = null
}
const deleting = ref<RoutineRow | null>(null)
const confirmDialog = ref<InstanceType<typeof ConfirmDialog> | null>(null)
function askDelete(r: RoutineRow) {
  deleting.value = r
  confirmDialog.value?.open()
}
</script>
