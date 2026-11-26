// SPEC §9 TV app, Go on a Quest: the §5 Random Quest picker on the TV. Each Pick or Re-roll reads the draw fresh
// (tv_quest_draw), picks with the shared picker rules, and saves the pick; the outcomes are the TV's other quest
// writes. Kept for the TV page's life, so the popup (and the last few tasks picked) survive the night screen.
import { ref } from 'vue'
import type { EnergyLevel, QuestRow, TaskRow, TimeBucket } from '@/sync/types'
import { markPicked, pickFromDraw, RECENT_PICKS, tasksInDraw, type Picked, type QuestFilter } from '@/quests/picker'
import { serverCall } from '@/server/server'
import { isUnpaired } from '@/tv/screen/tvServer'
import { messages } from '@/messages'

export interface QuestDraw {
  quests: QuestRow[]
  tasks: TaskRow[]
}

/** What one press of Pick draws: a quest or a task from the fresh draw, or null when nothing fits. */
export function drawOne(draw: QuestDraw, filter: QuestFilter, recentTasks: readonly string[], today: string, timeZone: string, random: () => number = Math.random): Picked | null {
  return pickFromDraw(draw.quests, tasksInDraw(draw.tasks, today, timeZone), filter, recentTasks, random)
}

export type Shown = { kind: 'quest'; quest: QuestRow } | { kind: 'task'; task: TaskRow }
/** SPEC §2 Undo in place: Mark done leaves a line with its own Undo, until the popup closes. */
export interface QuestLine {
  key: string
  message: string
  undo: () => Promise<unknown>
}

const m = messages.quests

/** `onUnpaired`: a press refused because the TV was unpaired sends it back to pairing, like the snapshot does. */
export function useTvQuest(deviceKey: () => string | null, today: () => string, timeZone: () => string, onUnpaired: () => void) {
  const open = ref(false)
  const energy = ref<EnergyLevel | null>(null)
  const time = ref<TimeBucket | null>(null)
  const shown = ref<Shown | null>(null)
  const notice = ref('')
  const lines = ref<QuestLine[]>([])
  const trouble = ref(false)
  const busy = ref(false)
  // Tasks have no "last picked" to store, so the last few picked here are skipped, like recent quests.
  let recentTasks: string[] = []

  const saveQuest = (questId: string, action: string, extra: Record<string, unknown> = {}) =>
    serverCall<null>('tv_save_quest', { device_key: deviceKey(), quest_id: questId, action, ...extra })
  const saveTask = (taskId: string, action: 'done' | 'today') => serverCall<null>('tv_save_draw_task', { device_key: deviceKey(), task_id: taskId, action, today: today() })

  /** Runs one press; out of reach, nothing changes and the popup says so, ready to press again. */
  async function act(how: () => Promise<void>) {
    if (busy.value) return
    busy.value = true
    try {
      await how()
      trouble.value = false
    } catch (err) {
      if (isUnpaired(err)) return onUnpaired()
      trouble.value = true
    } finally {
      busy.value = false
    }
  }

  const pick = () =>
    act(async () => {
      const draw = await serverCall<QuestDraw>('tv_quest_draw', { device_key: deviceKey() })
      const choice = drawOne(draw, { energy: energy.value, time: time.value }, recentTasks, today(), timeZone())
      notice.value = ''
      if (!choice) {
        shown.value = null
        notice.value = m.nothingFits
        return
      }
      if (choice.kind === 'task') {
        recentTasks = recentTasks.filter((id) => id !== choice.id).concat(choice.id).slice(-RECENT_PICKS)
        shown.value = { kind: 'task', task: draw.tasks.find((t) => t.id === choice.id)! }
        return
      }
      const quest = draw.quests.find((q) => q.id === choice.id)!
      await saveQuest(quest.id, 'pick')
      // As the server now holds it (counted), so "Picked N times before" reads the same as on my phone.
      shown.value = { kind: 'quest', quest: markPicked(quest) }
    })

  const accept = (q: QuestRow) =>
    act(async () => {
      await saveQuest(q.id, 'accept')
      shown.value = null
      notice.value = m.accepted
    })

  const finish = (q: QuestRow) =>
    act(async () => {
      const logId = crypto.randomUUID()
      await saveQuest(q.id, 'done', { today: today(), log_id: logId })
      shown.value = null
      notice.value = ''
      const undo = () => saveQuest(q.id, 'undo_done', { log_id: logId, before_status: q.status, before_completed_at: q.completed_at ?? null })
      lines.value = lines.value.concat({ key: logId, message: messages.undo.questDone(q.title), undo })
    })

  const undoLine = (line: QuestLine) =>
    act(async () => {
      await line.undo()
      lines.value = lines.value.filter((l) => l !== line)
    })

  const taskDone = (t: TaskRow) =>
    act(async () => {
      await saveTask(t.id, 'done')
      shown.value = null
      notice.value = m.taskFinished
    })

  const doToday = (t: TaskRow) =>
    act(async () => {
      await saveTask(t.id, 'today')
      shown.value = { kind: 'task', task: { ...t, due_date: today() } }
      notice.value = m.taskToday
    })

  function show() {
    open.value = true
  }
  /** Closing the popup ends what it showed, and its Undo lines (SPEC §2: a line stays until its window closes). */
  function close() {
    open.value = false
    shown.value = null
    notice.value = ''
    lines.value = []
    trouble.value = false
  }

  const setEnergy = (e: EnergyLevel | null) => (energy.value = e)
  const setTime = (t: TimeBucket | null) => (time.value = t)

  return { open, energy, time, setEnergy, setTime, shown, notice, lines, trouble, busy, show, close, pick, accept, finish, undoLine, taskDone, doToday }
}

export type TvQuest = ReturnType<typeof useTvQuest>
