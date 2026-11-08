<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-28">
    <template v-if="routine">
      <div>
        <RouterLink to="/routines" class="text-sm text-muted underline">{{ m.run.back }}</RouterLink>
        <h1 class="mt-2 text-2xl font-bold">{{ routine.title }}</h1>
      </div>

      <template v-if="anytimeFinished">
        <p class="rounded-2xl bg-surface p-6 text-lg font-medium" role="status" data-testid="routine-finished">{{ m.run.finished }}</p>
        <button type="button" class="min-h-12 self-start rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="startAgain = true">
          {{ m.run.startAgain }}
        </button>
      </template>
      <section v-else-if="state.current" class="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6" aria-live="polite">
        <p class="text-sm text-muted" data-testid="step-of">{{ m.run.stepOf(state.index, state.total) }}</p>
        <p class="cross-out text-3xl font-bold break-words" :class="{ crossing }" data-testid="current-step">{{ stepTitle }}</p>
        <p v-if="currentHabit" class="-mt-4 text-sm text-muted" data-testid="habit-step-note">
          <span v-if="currentHabit.is_priority" class="text-danger">⚠ </span>{{ m.run.habitNote }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="min-h-14 rounded-xl border border-line px-4 text-lg font-medium" :disabled="busy" @click="act('skipped')">
            {{ m.run.skip }}
          </button>
          <button type="button" class="min-h-14 rounded-xl bg-accent px-4 text-lg font-semibold text-accent-ink" :disabled="busy" @click="act('completed')">
            {{ m.run.completed }}
          </button>
        </div>
      </section>

      <p v-else-if="state.finished" class="rounded-2xl bg-surface p-6 text-lg font-medium" role="status" data-testid="routine-finished">{{ m.run.finished }}</p>
      <p v-else class="text-muted">{{ m.noSteps }}</p>
    </template>
    <p v-else-if="routine === undefined" class="text-muted">{{ m.run.missing }}</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Routines: one step at a time. Skip moves on at once; Completed crosses the step out first.
// The step 7 notification opens this screen directly (/routines/<id>/run).
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { activeSteps, currentRun, habitDoneStepIds, habitOf, isAnytime, runState, stepsForDay } from '@/routines/rules'
import { messages } from '@/messages'
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'

const CROSS_OUT_MS = 600

const brain = useBrainStore()
const route = useRoute()
const m = messages.routines
const { today } = useToday()
const id = computed(() => String(route.params.id))

const routine = useLiveQuery<RoutineRow | undefined | null>(
  async () => (brain.db ? ((await brain.db.routines.get(id.value)) ?? undefined) : null),
  null,
  [() => brain.db, id],
)
const steps = useLiveQuery<RoutineStepRow[]>(
  async () => (brain.db ? activeSteps(await brain.db.routine_steps.where('routine_id').equals(id.value).toArray(), id.value) : []),
  [],
  [() => brain.db, id],
)
const runs = useLiveQuery<RoutineRunRow[]>(
  async () => (brain.db ? brain.db.routine_runs.where('routine_id').equals(id.value).toArray() : []),
  [],
  [() => brain.db, id],
)
const logs = useLiveQuery<RoutineStepLogRow[]>(async () => (brain.db ? brain.db.routine_step_logs.toArray() : []), [], [() => brain.db])

const habits = useLiveQuery<HabitRow[]>(async () => (brain.db ? brain.db.habits.toArray() : []), [], [() => brain.db])
const habitLogs = useLiveQuery<HabitLogRow[]>(async () => (brain.db ? brain.db.habit_logs.toArray() : []), [], [() => brain.db])

// Today's steps: habit steps only on days their habit is scheduled; habits already done count as passed.
const daySteps = computed(() => stepsForDay(steps.value, habits.value, today.value))
const run = computed(() => (routine.value ? currentRun(routine.value, runs.value, today.value) : undefined))
const habitDone = computed(() => habitDoneStepIds(daySteps.value, habitLogs.value, today.value))
const state = computed(() => runState(daySteps.value, run.value, logs.value, habitDone.value))
const currentHabit = computed(() => (state.value.current ? habitOf(state.value.current, habits.value) : undefined))
const stepTitle = computed(() => currentHabit.value?.title ?? state.value.current?.title ?? '')

// A run-anytime routine just finished: say so, and offer "Start again" for a fresh run (SPEC §5 Routines).
const startAgain = ref(false)
const anytimeFinished = computed(
  () =>
    !!routine.value &&
    isAnytime(routine.value) &&
    !run.value &&
    !startAgain.value &&
    runs.value.some((r) => r.routine_id === id.value && !r.deleted_at && r.finished_at),
)
const crossing = ref(false)
const busy = ref(false)

async function act(status: 'completed' | 'skipped') {
  if (!routine.value || busy.value) return
  busy.value = true
  try {
    if (status === 'completed') {
      crossing.value = true
      await new Promise((r) => setTimeout(r, CROSS_OUT_MS))
    }
    await brain.recordRoutineStep(routine.value, status)
  } finally {
    crossing.value = false
    busy.value = false
  }
}
</script>

<style scoped>
/* Completed: a strikethrough draws across the step, then it fades and the next step appears (SPEC §5 Routines). */
.cross-out {
  background-image: linear-gradient(currentColor, currentColor);
  background-position: 0 55%;
  background-repeat: no-repeat;
  background-size: 0 3px;
  transition:
    background-size 400ms ease-out,
    opacity 200ms 400ms;
}
.cross-out.crossing {
  background-size: 100% 3px;
  opacity: 0.4;
}
@media (prefers-reduced-motion: reduce) {
  .cross-out {
    transition: none;
  }
}
</style>
