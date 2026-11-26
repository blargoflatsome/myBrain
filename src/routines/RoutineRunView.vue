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
        <button v-if="resuming" type="button" class="min-h-11 self-start text-sm text-muted underline" @click="startAgain = true">
          {{ m.run.startAgain }}
        </button>
      </section>

      <div v-else-if="finished" class="flex items-center gap-4 rounded-2xl bg-surface p-6" role="status" data-testid="routine-finished">
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
// SPEC §5 Routines: one step at a time (the steps themselves run in useRoutineRun, shared with the TV).
// A routine's reminder notification opens this screen directly (/routines/<id>/run).
import { useRows, useRow } from '@/sync/useRows'
import AppIcon from '@/components/AppIcon.vue'
import { computed } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { useBrainStore } from '@/stores/brain'
import { useToday } from '@/composables/useToday'
import { activeSteps } from '@/routines/rules'
import { useRoutineRun } from '@/routines/useRoutineRun'
import { messages } from '@/messages'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
const m = messages.routines
const { today } = useToday()
const id = computed(() => String(route.params.id))

// A deleted routine reads as missing (SPEC §5 Routines), so the page says it can't find it.
const routine = useRow('routines', id)
const routineSteps = useRows((db) => db.routine_steps.where('routine_id').equals(id.value).toArray(), [id])
const steps = computed(() => activeSteps(routineSteps.value, id.value))
const runs = useRows((db) => db.routine_runs.where('routine_id').equals(id.value).toArray(), [id])
const logs = useRows('routine_step_logs')
const habits = useRows('habits')
const habitLogs = useRows('habit_logs')

const { step, currentHabit, stepTitle, stepOfText, progress, finished, resuming, crossing, busy, act, startAgain } = useRoutineRun({
  routine,
  steps,
  runs,
  logs,
  habits,
  habitLogs,
  today,
  record: (r, status) => brain.recordRoutineStep(r, status),
  completeSkipped: (r, stepId) => brain.completeSkippedStep(r, stepId),
  leave: () => void router.push('/routines'),
})
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
