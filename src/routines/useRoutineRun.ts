// SPEC §5 Routines: running a routine one step at a time, shared by the phone's run page and the TV (SPEC §9 Routines).
// Skip moves on at once; Completed crosses the step out first. Finishing leaves (back to the list); a finished run
// with skipped steps resumes with just those, and a run-anytime routine can Start again instead.
import { computed, ref, type Ref } from 'vue'
import type { HabitLogRow, HabitRow, RoutineRow, RoutineRunRow, RoutineStepLogRow, RoutineStepRow } from '@/sync/types'
import { currentRun, habitDoneStepIds, habitOf, resumableRun, runState, skippedSteps, stepsForDay } from '@/routines/rules'
import { messages } from '@/messages'

export const CROSS_OUT_MS = 600

export interface RoutineRunSource {
  routine: Ref<RoutineRow | null | undefined>
  /** The routine's active steps, in order. */
  steps: Ref<RoutineStepRow[]>
  runs: Ref<RoutineRunRow[]>
  logs: Ref<RoutineStepLogRow[]>
  habits: Ref<HabitRow[]>
  habitLogs: Ref<HabitLogRow[]>
  today: Ref<string>
  /** Saves Skip or Completed on the current step; `finish` is set when that was the last one. */
  record: (routine: RoutineRow, status: 'completed' | 'skipped') => Promise<{ finish: unknown } | null>
  /** Resume: saves Completed on a step skipped earlier. */
  completeSkipped: (routine: RoutineRow, stepId: string) => Promise<unknown>
  /** Back to the list of routines. */
  leave: () => void
}

export function useRoutineRun(src: RoutineRunSource) {
  const m = messages.routines.run
  // Today's steps: habit steps only on days their habit is scheduled; habits already done count as passed.
  const daySteps = computed(() => stepsForDay(src.steps.value, src.habits.value, src.today.value))
  const run = computed(() => (src.routine.value ? currentRun(src.routine.value, src.runs.value, src.today.value) : undefined))
  const habitDone = computed(() => habitDoneStepIds(daySteps.value, src.habitLogs.value, src.today.value))
  const state = computed(() => runState(daySteps.value, run.value, src.logs.value, habitDone.value))

  // "Start again" on a run-anytime routine with skips starts a fresh run instead of resuming.
  const startAgain = ref(false)

  // Resume: steps skipped again or completed on this visit leave the queue; when it's empty, leave.
  const leaving = ref(false)
  const resumeRun = computed(() => (src.routine.value && !startAgain.value ? resumableRun(src.routine.value, src.runs.value, src.today.value) : undefined))
  const skipped = computed(() => skippedSteps(daySteps.value, resumeRun.value, src.logs.value, habitDone.value))
  const handled = ref<string[]>([])
  const resumeQueue = computed(() => skipped.value.filter((s) => !handled.value.includes(s.id)))
  const resuming = computed(() => !leaving.value && resumeQueue.value.length > 0)

  const step = computed(() => (leaving.value ? null : resuming.value ? resumeQueue.value[0]! : state.value.current))
  const currentHabit = computed(() => (step.value ? habitOf(step.value, src.habits.value) : undefined))
  const stepTitle = computed(() => currentHabit.value?.title ?? step.value?.title ?? '')
  const resumeTotal = computed(() => handled.value.length + resumeQueue.value.length)
  const stepOfText = computed(() =>
    resuming.value ? m.skippedOf(handled.value.length + 1, resumeTotal.value) : m.stepOf(state.value.index, state.value.total),
  )
  const progress = computed(() => {
    if (resuming.value) return (handled.value.length / resumeTotal.value) * 100
    return state.value.total ? (state.value.done / state.value.total) * 100 : 0
  })
  const finished = computed(() => state.value.finished)
  const crossing = ref(false)
  const busy = ref(false)

  async function act(status: 'completed' | 'skipped') {
    const shown = step.value
    const routine = src.routine.value
    if (!routine || busy.value || !shown) return
    busy.value = true
    try {
      if (status === 'completed') {
        crossing.value = true
        await new Promise((r) => setTimeout(r, CROSS_OUT_MS))
      }
      if (resuming.value) {
        if (status === 'completed') await src.completeSkipped(routine, shown.id)
        handled.value = [...handled.value, shown.id]
        if (!resumeQueue.value.length) leave()
      } else {
        const action = await src.record(routine, status)
        if (action?.finish) leave()
      }
    } finally {
      crossing.value = false
      busy.value = false
    }
  }

  function leave() {
    leaving.value = true
    src.leave()
  }

  return { step, currentHabit, stepTitle, stepOfText, progress, finished, resuming, crossing, busy, act, startAgain }
}
