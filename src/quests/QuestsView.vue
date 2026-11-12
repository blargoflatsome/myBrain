<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <PageHeading :heading="m.heading" :intro="m.intro">
      <NewButton :label="m.newQuest" data-testid="new-quest" @click="startNew" />
    </PageHeading>

    <!-- The picker: what I have the energy and time for, then pick. -->
    <section class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" data-testid="quest-picker">
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{{ m.energyLabel }}</legend>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="m.energyLabel">
          <button type="button" :class="filterChip(!energy)" :aria-pressed="!energy" @click="energy = null">
            {{ m.any }}
          </button>
          <button v-for="e in ENERGY_LEVELS" :key="e" type="button" :class="filterChip(energy === e)" :aria-pressed="energy === e" @click="energy = e">
            {{ m.energy[e] }}
          </button>
        </div>
      </fieldset>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{{ m.timeLabel }}</legend>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="m.timeLabel">
          <button type="button" :class="filterChip(!time)" :aria-pressed="!time" @click="time = null">
            {{ m.any }}
          </button>
          <button v-for="t in TIME_BUCKETS" :key="t" type="button" :class="filterChip(time === t)" :aria-pressed="time === t" @click="time = t">
            {{ m.time[t] }}
          </button>
        </div>
      </fieldset>

      <button type="button" class="min-h-12 self-start rounded-xl bg-accent px-5 font-semibold text-accent-ink" @click="pick">
        <AppIcon name="shuffle" class="mr-1" />{{ m.pick }}
      </button>
    </section>

    <section v-if="current" ref="resultBox" tabindex="-1" class="flex flex-col gap-3 rounded-2xl border border-line border-l-4 border-l-accent bg-surface p-4" data-testid="quest-result" aria-live="polite">
      <p class="text-sm text-muted">{{ m.resultHeading }}</p>
      <h2 class="text-xl font-semibold">{{ current.title }}</h2>
      <RichNotes :value="current.details" />
      <p class="flex flex-wrap gap-2 text-sm">
        <span v-if="current.energy_level" :class="tag">{{ m.energy[current.energy_level] }}</span>
        <span v-if="current.time_bucket" :class="tag">{{ m.time[current.time_bucket] }}</span>
        <span v-if="(current.times_picked ?? 0) > 1" class="text-muted">{{ m.pickedCount((current.times_picked ?? 1) - 1) }}</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="primaryButtonSmall" @click="accept(current)">{{ m.accept }}</button>
        <button type="button" :class="quiet" @click="pick">{{ m.reroll }}</button>
        <button type="button" :class="quiet" @click="finish(current)">{{ m.done }}</button>
      </div>
    </section>
    <!-- SPEC §5 Random Quest: a task can come up too; it has its own buttons and leaves quest numbers alone. -->
    <section v-if="currentTask" class="flex flex-col gap-3 rounded-2xl border border-line border-l-4 border-l-accent bg-surface p-4" data-testid="quest-task-result" aria-live="polite">
      <p class="text-sm text-muted">{{ m.taskResultHeading }}</p>
      <h2 class="text-xl font-semibold break-words">{{ currentTask.title }}</h2>
      <RichNotes :value="currentTask.notes" />
      <div class="flex flex-wrap gap-2">
        <button type="button" :class="primaryButtonSmall" @click="taskDone(currentTask)">{{ m.taskDone }}</button>
        <button v-if="!currentTask.due_date" type="button" :class="quiet" @click="doToday(currentTask)">{{ m.doToday }}</button>
        <button type="button" :class="quiet" @click="pick">{{ m.reroll }}</button>
      </div>
    </section>
    <p v-if="notice" class="rounded-xl border border-line bg-surface p-3" role="status" data-testid="quest-notice">{{ notice }}</p>

    <section v-if="inProgress.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.inProgress }}</h2>
      <ul class="divide-y divide-line rounded-2xl border border-line bg-surface">
        <li v-for="q in inProgress" :key="q.id" class="flex items-center gap-3 px-3 py-2">
          <span class="min-w-0 flex-1">{{ q.title }}</span>
          <button type="button" :class="quiet" :aria-label="`${m.done}: ${q.title}`" @click="finish(q)">{{ m.done }}</button>
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ m.allHeading }}</h2>
      <p v-if="!open.length" class="text-muted">{{ m.empty }}</p>
      <ul v-else class="divide-y divide-line rounded-2xl border border-line bg-surface" data-testid="quest-list">
        <li v-for="q in pageItems" :key="q.id" class="flex items-center gap-1 pr-1" data-testid="quest-row">
          <!-- The title gets the full width, with its chips on a line under it, so a long title never squeezes. -->
          <button type="button" class="flex min-h-14 min-w-0 flex-1 flex-col items-start gap-1 px-3 py-2 text-left hover:bg-bg" @click="edit(q)">
            <span class="max-w-full break-words" data-testid="quest-title">{{ q.title }}</span>
            <span class="flex flex-wrap gap-1.5 text-xs">
              <span v-if="q.energy_level" :class="tag">{{ m.energy[q.energy_level] }}</span>
              <span v-if="q.time_bucket" :class="tag">{{ m.time[q.time_bucket] }}</span>
              <span v-if="doneCounts.get(q.id)" :class="tag" data-testid="quest-done-count">{{ m.doneCount(doneCounts.get(q.id)!) }}</span>
            </span>
          </button>
          <button type="button" :class="[smallButton, 'shrink-0']" :aria-label="m.pickThisLabel(q.title)" @click="pickThis(q)">
            {{ m.pickThis }}
          </button>
          <RowDelete :label="m.deleteLabel(q.title)" @click="remove(q)" />
        </li>
      </ul>
      <PageControls v-model:page="page" :page-count="pageCount" :label="m.allHeading" />
    </section>

    <QuestEditor :quest="editing" :is-new="isNew" @save="saveEdit" @delete="remove" @close="editing = null" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Random Quest: pick a project from the bucket list when bored, filtered by time and energy.
import AppIcon from '@/components/AppIcon.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QuestEditor from '@/quests/components/QuestEditor.vue'
import PageHeading from '@/components/PageHeading.vue'
import NewButton from '@/components/NewButton.vue'
import RowDelete from '@/components/RowDelete.vue'
import { useAuthStore } from '@/stores/auth'
import { DEFAULT_QUEST_ENERGY, DEFAULT_QUEST_TIME } from '@/capture/capture'
import RichNotes from '@/components/RichNotes.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { acceptQuest, byEffort, ENERGY_LEVELS, markPicked, pickFromDraw, RECENT_PICKS, tasksInDraw, TIME_BUCKETS } from '@/quests/picker'
import { moveTask, toggleDone } from '@/tasks/rules'
import { useToday } from '@/composables/useToday'
import { useUndoStore } from '@/stores/undo'
import { messages } from '@/messages'
import type { EnergyLevel, QuestLogRow, QuestRow, TaskRow, TimeBucket } from '@/sync/types'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { filterChip, primaryButtonSmall, smallButton } from '@/ui/styles'

const QUESTS_PER_PAGE = 10
const brain = useBrainStore()
const m = messages.quests

const all = useLiveQuery<QuestRow[]>(async () => (brain.db ? brain.db.quests.toArray() : []), [], [() => brain.db])
const live = computed(() => all.value.filter((q) => !q.deleted_at))
// Easiest first, 10 at a time (SPEC §5 Random Quest).
const open = computed(() => live.value.filter((q) => q.status === 'open').sort(byEffort))
const { page, pageCount, pageItems } = usePagination(open, QUESTS_PER_PAGE)
const inProgress = computed(() => live.value.filter((q) => q.status === 'accepted'))

const energy = ref<EnergyLevel | null>(null)
const time = ref<TimeBucket | null>(null)
const currentId = ref<string | null>(null)
const current = computed(() => live.value.find((q) => q.id === currentId.value) ?? null)

// Tasks in the draw (SPEC §5 Random Quest): today's open tasks and Undated ones.
const { today, timeZone } = useToday()
const allTasks = useLiveQuery<TaskRow[]>(async () => (brain.db ? brain.db.tasks.toArray() : []), [], [() => brain.db])
const drawTasks = computed(() => tasksInDraw(allTasks.value, today.value, timeZone.value))
const currentTaskId = ref<string | null>(null)
const currentTask = computed(() => drawTasks.value.find((t) => t.id === currentTaskId.value) ?? null)
// Tasks have no "last picked" to store, so the last few picked here are skipped, like recent quests.
const recentTasks = ref<string[]>([])
const notice = ref('')

async function pick() {
  notice.value = ''
  currentId.value = null
  currentTaskId.value = null
  const choice = pickFromDraw(live.value, drawTasks.value, { energy: energy.value, time: time.value }, recentTasks.value)
  if (!choice) {
    notice.value = m.nothingFits
    return
  }
  if (choice.kind === 'task') {
    recentTasks.value = [...recentTasks.value.filter((id) => id !== choice.id), choice.id].slice(-RECENT_PICKS)
    currentTaskId.value = choice.id
    return
  }
  const quest = live.value.find((q) => q.id === choice.id)!
  await brain.save('quests', markPicked(quest))
  currentId.value = quest.id
}

async function taskDone(t: TaskRow) {
  await brain.saveTask(toggleDone(t))
  currentTaskId.value = null
  notice.value = m.taskFinished
}
async function doToday(t: TaskRow) {
  await brain.saveTask(moveTask(t, today.value))
  notice.value = m.taskToday
}

async function accept(q: QuestRow) {
  await brain.save('quests', acceptQuest(q))
  currentId.value = null
  notice.value = m.accepted
}

// I can choose one myself instead of rolling (SPEC §5 Random Quest); it counts as a pick like any other.
const resultBox = ref<HTMLElement | null>(null)
async function pickThis(q: QuestRow) {
  notice.value = ''
  currentTaskId.value = null
  await brain.save('quests', markPicked(q))
  currentId.value = q.id
  await nextTick()
  resultBox.value?.scrollIntoView({ block: 'nearest' })
  resultBox.value?.focus()
}

// Done and delete happen straight away, with Undo (SPEC §2).
const undo = useUndoStore()
async function finish(q: QuestRow) {
  const before = { ...q }
  const logId = await brain.finishQuest(q)
  if (currentId.value === q.id) currentId.value = null
  notice.value = ''
  undo.offer(messages.undo.questDone(q.title), () => brain.unfinishQuest(before, logId))
}

const editing = ref<QuestRow | null>(null)
const isNew = ref(false)
function edit(q: QuestRow) {
  isNew.value = false
  editing.value = q
}
// SPEC §5 Random Quest: + New quest, starting as Ugh and 30 min like every new quest.
const auth = useAuthStore()
function startNew() {
  isNew.value = true
  editing.value = { id: crypto.randomUUID(), user_id: auth.user?.id ?? '', title: '', details: null, energy_level: DEFAULT_QUEST_ENERGY, time_bucket: DEFAULT_QUEST_TIME, status: 'open', times_picked: 0, deleted_at: null }
}
// Opened with ?quest=<id> (from search): open that quest's editor.
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.quest, all],
  ([id]) => {
    if (typeof id !== 'string') return
    const quest = all.value.find((q) => q.id === id && !q.deleted_at)
    if (!quest) return
    edit(quest)
    void router.replace({ query: {} })
  },
  { immediate: true },
)
async function saveEdit(q: QuestRow) {
  await brain.save('quests', q)
  editing.value = null
}
async function remove(q: QuestRow) {
  await brain.remove('quests', q.id)
  if (currentId.value === q.id) currentId.value = null
  if (editing.value?.id === q.id) editing.value = null
  undo.offer(messages.undo.deleted(q.title), () => brain.restore('quests', q.id))
}

// How many times each quest has been done (they can be done again).
const logs = useLiveQuery<QuestLogRow[]>(async () => (brain.db ? (await brain.db.quest_logs.toArray()).filter((l) => !l.deleted_at) : []), [], [() => brain.db])
const doneCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const l of logs.value) counts.set(l.quest_id, (counts.get(l.quest_id) ?? 0) + 1)
  return counts
})

const quiet = 'min-h-11 rounded-xl border border-line px-4'
/** A small grey label for energy and time. */
const tag = 'rounded-full bg-bg px-2 py-0.5 text-muted'
</script>
