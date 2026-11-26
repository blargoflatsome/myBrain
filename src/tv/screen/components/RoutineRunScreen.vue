<template>
  <main class="tv-run" data-testid="tv-run">
    <header class="tv-bar">
      <h1 class="tv-heading">{{ routine?.title }}</h1>
      <button type="button" class="tv-button" data-testid="tv-run-back" @click="emit('close')">{{ m.back }}</button>
    </header>
    <p v-if="trouble" class="tv-note" role="status" data-testid="tv-run-trouble">{{ tv.offline }}</p>

    <section v-if="step" class="tv-panel tv-run-step" aria-live="polite">
      <p class="tv-muted" data-testid="tv-step-of">{{ stepOfText }}</p>
      <div class="tv-run-track" aria-hidden="true"><div class="tv-run-bar" :style="{ width: `${progress}%` }" /></div>
      <p class="tv-run-title tv-cross-out" :class="{ 'tv-crossing': crossing }" data-testid="tv-current-step">{{ stepTitle }}</p>
      <p v-if="currentHabit" class="tv-muted" data-testid="tv-habit-step-note">
        <span v-if="currentHabit.is_priority" aria-hidden="true">⚠ </span>{{ m.habitNote }}
      </p>
      <div class="tv-run-buttons">
        <button type="button" class="tv-button tv-run-button" :aria-disabled="busy" data-testid="tv-skip" @click="press('skipped')">{{ m.skip }}</button>
        <button ref="completedButton" type="button" class="tv-button tv-run-button" :aria-disabled="busy" data-testid="tv-completed" @click="press('completed')">
          {{ m.completed }}
        </button>
      </div>
      <button v-if="resuming && routine && isAnytime(routine)" type="button" class="tv-button tv-run-again" data-testid="tv-start-again" @click="startAgain = true">
        {{ m.startAgain }}
      </button>
    </section>
    <p v-else-if="finished" class="tv-panel tv-run-step" role="status" data-testid="tv-run-finished">{{ m.finished }}</p>
    <p v-else class="tv-muted">{{ routines.noSteps }}</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Routines: a routine full screen, one step at a time, with every §5 Routines rule (the run flow is
// the phone's, useRoutineRun). Each press is saved on the server and the TV reads back what it shows, so it's the same
// run as on my phone. While it's open the night screen is held off; finishing, or Back, returns to the dashboard.
import { computed, inject, nextTick, onMounted, onScopeDispose, ref } from 'vue'
import { useRoutineRun } from '@/routines/useRoutineRun'
import { activeSteps, isAnytime } from '@/routines/rules'
import { IDLE_HOLD } from '@/tv/screen/idle'
import { resumeSave, saveRoutineStep, stepSave, type RoutineSave, type TvRoutineFacts } from '@/tv/screen/routines'
import type { RoutineRow } from '@/sync/types'
import { messages } from '@/messages'

const props = defineProps<{
  routine: RoutineRow | null
  facts: TvRoutineFacts
  today: string
  timeZone: string
  deviceKey: () => string | null
  /** Reads the snapshot again, so the next step shows what the server now holds. */
  refresh: () => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()
const m = messages.routines.run
const routines = messages.routines
const tv = messages.tv

const hold = inject(IDLE_HOLD, () => {})
hold(true)
onScopeDispose(() => hold(false))

const trouble = ref(false)
async function send(save: RoutineSave | null) {
  if (!save) return
  try {
    await saveRoutineStep(props.deviceKey(), save)
    trouble.value = false
  } catch (err) {
    // Out of reach: nothing was saved, so the same step stays to press again.
    trouble.value = true
    throw err
  }
  await props.refresh()
}

const { step, currentHabit, stepTitle, stepOfText, progress, finished, resuming, crossing, busy, act, startAgain } = useRoutineRun({
  routine: computed(() => props.routine),
  steps: computed(() => (props.routine ? activeSteps(props.facts.steps, props.routine.id) : [])),
  runs: computed(() => props.facts.runs),
  logs: computed(() => props.facts.logs),
  habits: computed(() => props.facts.habits),
  habitLogs: computed(() => props.facts.habitLogs),
  today: computed(() => props.today),
  record: async (r, status) => {
    const save = stepSave(r, props.facts, status, props.today, new Date(), props.timeZone)
    await send(save)
    return save ? { finish: save.finished || null } : null
  },
  completeSkipped: (r, stepId) => send(resumeSave(r, props.facts, stepId, props.today, new Date(), props.timeZone)),
  leave: () => emit('close'),
})

async function press(status: 'completed' | 'skipped') {
  try {
    await act(status)
  } catch {
    // Shown as trouble above; the step stays.
  }
  void nextTick(() => completedButton.value?.focus())
}

const completedButton = ref<HTMLButtonElement | null>(null)
onMounted(() => completedButton.value?.focus())
</script>
