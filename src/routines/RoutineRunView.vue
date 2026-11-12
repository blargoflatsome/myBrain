<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <template v-if="routine">
      <div>
        <RouterLink to="/routines" class="text-sm text-muted underline">{{ m.run.back }}</RouterLink>
        <h1 class="mt-2 text-2xl font-bold">{{ routine.title }}</h1>
      </div>

      <section v-if="step" class="flex flex-col gap-6 rounded-2xl border border-line bg-surface p-6" aria-live="polite">
        <div class="flex flex-col gap-2">
          <p class="text-sm text-muted" data-testid="step-of">{{ stepOfText }}</p>
          <!-- SPEC §5 Celebrations: the bar moves forward with each step done. -->
          <div class="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div class="h-full rounded-full bg-done transition-[width] duration-500 ease-out" :style="{ width: `${progress}%` }" data-testid="routine-progress" />
          </div>
        </div>
        <p class="cross-out text-3xl font-bold break-words" :class="{ crossing }" data-testid="current-step">{{ stepTitle }}</p>
        <p v-if="currentHabit" class="-mt-4 text-sm text-muted" data-testid="habit-step-note">
          <AppIcon v-if="currentHabit.is_priority" name="alert" class="mr-1 text-carried" />{{ m.run.habitNote }}
        </p>
        <div class="grid grid-cols-2 gap-3">
          <button type="button" class="min-h-14 rounded-xl border border-line px-4 text-lg font-medium" :disabled="busy" @click="act('skipped')">
            {{ m.run.skip }}
          </button>
          <button type="button" class="min-h-14 rounded-xl bg-accent px-4 text-lg font-semibold text-accent-ink" :disabled="busy" @click="act('completed')">
            {{ m.run.completed }}
          </button>
        </div>
        <!-- A run-anytime routine can still start fresh instead of going back over its skips. -->
        <button v-if="resuming && isAnytime(routine)" type="button" class="min-h-11 self-start text-sm text-muted underline" @click="startAgain = true">
          {{ m.run.startAgain }}
        </button>
      </section>

      <div v-else-if="state.finished" class="flex items-center gap-4 rounded-2xl bg-surface p-6" role="status" data-testid="routine-finished">
        <!-- SPEC §5 Celebrations: the steps fold into one ticked badge. -->
        <span class="celebrate-fold flex size-14 shrink-0 items-center justify-center rounded-full bg-done text-bg" aria-hidden="true"><AppIcon name="check" size="size-8" /></span>
        <span class="text-lg font-medium">{{ m.run.finished }}</span>
      </div>
      <p v-else class="text-muted">{{ m.noSteps }}</p>
    </template>
    <p v-else-if="routine === undefined" class="text-muted">{{ m.run.missing }}</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Routines: one step at a time. Skip moves on at once; Completed crosses the step out first. Finishing goes
// back to the Routines page; a finished run with skipped steps resumes here with just those steps.
// A routine's reminder notification opens this screen directly (/routines/<id>/run).
import AppIcon from '@/components/AppIcon.vue'
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { activeSteps, currentRun, habitDoneStepIds, habitOf, isAnytime, resumableRun, runState, skippedSteps, stepsForDay } from '@/routines/rules'
import { messages } from '@/messages'
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'

const CROSS_OUT_MS = 600

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
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

// "Start again" on a run-anytime routine with skips starts a fresh run instead of resuming (SPEC §5 Routines).
const startAgain = ref(false)

// Resume (SPEC §5 Routines): a finished run with skipped steps goes back over just those. Steps skipped again or
// completed on this visit leave the queue; when it's empty, back to the Routines page.
const leaving = ref(false)
const resumeRun = computed(() => (routine.value && !startAgain.value ? resumableRun(routine.value, runs.value, today.value) : undefined))
const skipped = computed(() => skippedSteps(daySteps.value, resumeRun.value, logs.value, habitDone.value))
const handled = ref<string[]>([])
const resumeQueue = computed(() => skipped.value.filter((s) => !handled.value.includes(s.id)))
const resuming = computed(() => !leaving.value && resumeQueue.value.length > 0)

const step = computed(() => (leaving.value ? null : resuming.value ? resumeQueue.value[0]! : state.value.current))
const currentHabit = computed(() => (step.value ? habitOf(step.value, habits.value) : undefined))
const stepTitle = computed(() => currentHabit.value?.title ?? step.value?.title ?? '')
const resumeTotal = computed(() => handled.value.length + resumeQueue.value.length)
const stepOfText = computed(() =>
  resuming.value ? m.run.skippedOf(handled.value.length + 1, resumeTotal.value) : m.run.stepOf(state.value.index, state.value.total),
)
const progress = computed(() => {
  if (resuming.value) return (handled.value.length / resumeTotal.value) * 100
  return state.value.total ? (state.value.done / state.value.total) * 100 : 0
})
const crossing = ref(false)
const busy = ref(false)

async function act(status: 'completed' | 'skipped') {
  const shown = step.value
  if (!routine.value || busy.value || !shown) return
  busy.value = true
  try {
    if (status === 'completed') {
      crossing.value = true
      await new Promise((r) => setTimeout(r, CROSS_OUT_MS))
    }
    if (resuming.value) {
      if (status === 'completed') await brain.completeSkippedStep(routine.value, shown.id)
      handled.value = [...handled.value, shown.id]
      if (!resumeQueue.value.length) leave()
    } else {
      const action = await brain.recordRoutineStep(routine.value, status)
      if (action?.finish) leave()
    }
  } finally {
    crossing.value = false
    busy.value = false
  }
}

function leave() {
  leaving.value = true
  void router.push('/routines')
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
