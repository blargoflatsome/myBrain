<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <PageHeading :heading="m.heading" :intro="view === 'priority' ? m.intro : undefined" intro-test-id="tasks-intro">
      <NewButton v-if="view === 'priority'" :label="messages.priority.add" data-testid="new-priority" @click="priorityList?.startNew()" />
      <NewButton v-else :label="m.newTask" data-testid="new-task" @click="startNew" />
    </PageHeading>
    <div class="flex gap-2 rounded-2xl bg-surface p-1" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'day'"
        :class="[tab, view === 'day' ? tabOn : 'text-muted']"
        @click="view = 'day'"
      >
        {{ m.todayHeading }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'undated'"
        :class="[tab, view === 'undated' ? tabOn : 'text-muted']"
        @click="view = 'undated'"
      >
        {{ m.undatedHeading }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'priority'"
        :class="[tab, view === 'priority' ? tabOn : 'text-muted']"
        @click="view = 'priority'"
      >
        {{ messages.priority.tabHeading }}
      </button>
    </div>

    <PriorityTasks v-if="view === 'priority'" ref="priorityList" :open-id="openPriority" @opened="(openPriority = null), router.replace({ query: {} })" />
    <template v-else>
      <!-- SPEC §5 Tasks: moving between days works like the Calendar (bordered arrows, Today when elsewhere). -->
      <div v-if="view === 'day'" class="flex items-center gap-1">
        <button type="button" :class="dayArrow" :aria-label="m.day.previous" @click="day = addDays(day, -1)">‹</button>
        <button v-if="offset !== 0" type="button" :class="smallButton" data-testid="tasks-today" @click="day = today">{{ m.day.today }}</button>
        <button type="button" :class="dayArrow" :aria-label="m.day.next" @click="day = addDays(day, 1)">›</button>
        <h2 class="ml-2 text-xl font-bold">{{ dayLabel }}</h2>
      </div>
      <h2 v-else class="text-xl font-bold">{{ m.undatedHeading }}</h2>

      <form v-if="canAdd" class="flex gap-2" @submit.prevent="add">
        <input
          v-model="newTitle" maxlength="500"
          :placeholder="addLabel"
          :aria-label="addLabel"
          class="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink"
        >
        <button type="submit" :class="primaryButton">{{ m.add }}</button>
      </form>

      <!-- SPEC §5 Tasks: one muted line above the list, never a stack of them. -->
      <p class="text-muted" :role="allDoneToday ? 'status' : undefined" data-testid="tasks-line">{{ topLine }}</p>

      <button
        v-if="canPick"
        type="button"
        :class="[chip(pickOn), 'self-start']"
        :aria-pressed="pickOn"
        data-testid="pick-three"
        @click="setPick(!pickOn)"
      >
        <span v-if="pickOn" aria-hidden="true">✓ </span>{{ m.pickThree }}
      </button>

      <button
        v-if="doneInList"
        type="button"
        :class="[smallButton, 'self-end']"
        data-testid="clear-done"
        @click="clearCrossedOff"
      >
        {{ m.clearDone(doneInList) }}
      </button>

      <ul class="flex flex-col gap-2">
        <TaskItem
          v-for="t in shownTasks"
          :key="t.id"
          :task="t"
          :today="today"
          @toggle="brain.saveTask(toggleDone(t))"
          @edit="edit(t)"
          @delete="remove(t)"
          @cancel="brain.saveTask(cancelTask(t))"
          @tomorrow="move(t, addDays(today, 1))"
          @undated="move(t, null)"
        />
      </ul>
      <template v-if="picking && picked.rest.length">
        <button
          type="button"
          :class="[smallButton, 'self-start']"
          :aria-expanded="showRest"
          aria-controls="tasks-rest"
          data-testid="show-rest"
          @click="showRest = !showRest"
        >
          {{ showRest ? m.hideRest : m.showRest(picked.rest.length) }}
        </button>
        <ul v-show="showRest" id="tasks-rest" class="flex flex-col gap-2">
          <TaskItem
            v-for="t in picked.rest"
            :key="t.id"
            :task="t"
            :today="today"
            @toggle="brain.saveTask(toggleDone(t))"
            @edit="edit(t)"
            @delete="remove(t)"
            @cancel="brain.saveTask(cancelTask(t))"
            @tomorrow="move(t, addDays(today, 1))"
            @undated="move(t, null)"
          />
        </ul>
      </template>
    </template>

    <TaskEditor :task="editing" :is-new="isNew" @save="saveEdit" @delete="remove" @close="editing = null" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Tasks: daily list (with carry-over), scheduling for other days, and the Undated list.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import TaskItem from '@/tasks/components/TaskItem.vue'
import TaskEditor from '@/tasks/components/TaskEditor.vue'
import PriorityTasks from '@/reminders/components/PriorityTasks.vue'
import PageHeading from '@/components/PageHeading.vue'
import NewButton from '@/components/NewButton.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { addDays, daysBetween } from '@/tasks/days'
import { cancelTask, clearDone, clearedForDay, DEFAULT_PRIORITY, moveTask, pickThree, tasksForDay, toggleDone, undatedTasks } from '@/tasks/rules'
import { messages } from '@/messages'
import type { TaskRow } from '@/sync/types'
import { shortDay } from '@/ui/dates'
import { useUndoStore } from '@/stores/undo'
import { chip, primaryButton, selected, smallButton } from '@/ui/styles'
import { readKey, writeKey } from '@/ui/storage'
import { useAuthStore } from '@/stores/auth'

const brain = useBrainStore()
const m = messages.tasks
const { today, timeZone } = useToday()

const view = ref<'day' | 'undated' | 'priority'>('day')
const day = ref(today.value)
// When midnight passes while the app is open on today, follow it to the new day.
watch(today, (next, prev) => {
  if (day.value === prev) day.value = next
})

const all = useLiveQuery<TaskRow[]>(async () => (brain.db ? brain.db.tasks.toArray() : []), [], [() => brain.db])
const list = computed(() => (view.value === 'undated' ? undatedTasks(all.value) : tasksForDay(all.value, day.value, today.value, timeZone.value)))

const offset = computed(() => daysBetween(today.value, day.value))
const dayLabel = computed(() => {
  if (offset.value === 0) return m.day.today
  if (offset.value === 1) return m.day.tomorrow
  if (offset.value === -1) return m.day.yesterday
  return shortDay(day.value)
})

const emptyText = computed(() => {
  if (view.value === 'undated') return m.emptyUndated
  if (offset.value < 0) return m.emptyPast
  return offset.value === 0 ? m.emptyToday : m.emptyFuture
})
// Cleared tasks still count: a day whose crossed-off tasks were all cleared is still "all done".
const allDoneToday = computed(
  () =>
    view.value === 'day' &&
    offset.value === 0 &&
    list.value.every((t) => t.status === 'done') &&
    (list.value.length > 0 || clearedForDay(all.value, today.value, timeZone.value).length > 0),
)

// SPEC §5 Tasks: one line above the list: empty or all done, else the past-you line, else the intro.
const topLine = computed(() => {
  if (allDoneToday.value) return m.allDone
  if (!list.value.length) return emptyText.value
  if (view.value === 'day' && offset.value === 0) return m.pastYouToday
  return m.intro
})

// SPEC §5 Tasks Pick 3: today's first 3 open tasks, the rest folded away. Remembered on this device.
const PICK_KEY = 'tasks.pickThree'
const pickOn = ref(readKey(PICK_KEY) === '1')
function setPick(on: boolean) {
  pickOn.value = on
  writeKey(PICK_KEY, on ? '1' : null)
}
const canPick = computed(() => view.value === 'day' && offset.value === 0 && list.value.filter((t) => t.status === 'open').length > 3)
const picking = computed(() => pickOn.value && canPick.value)
const picked = computed(() => pickThree(list.value))
const shownTasks = computed(() => (picking.value ? picked.value.shown : list.value))
const showRest = ref(false)

// SPEC §5 Tasks: "Clear crossed-off" hides done tasks from the list; they stay in history and stats.
const doneInList = computed(() => list.value.filter((t) => t.status === 'done').length)
const undo = useUndoStore()
async function clearCrossedOff() {
  const before = list.value.filter((t) => t.status === 'done' && !t.cleared_at)
  for (const t of clearDone(list.value)) await brain.saveTask(t)
  undo.offer(messages.undo.clearedTasks(before.length), async () => {
    for (const t of before) await brain.saveTask({ ...t, cleared_at: null })
  })
}

const newTitle = ref('')
const addLabel = computed(() =>
  view.value === 'undated' ? m.addPlaceholderUndated : m.addPlaceholder(offset.value === 0 || offset.value === 1 ? dayLabel.value.toLowerCase() : dayLabel.value),
)
const canAdd = computed(() => view.value === 'undated' || offset.value >= 0)
async function add() {
  await brain.addTask(newTitle.value, view.value === 'undated' ? null : day.value)
  newTitle.value = ''
}

const editing = ref<TaskRow | null>(null)
const isNew = ref(false)
function edit(t: TaskRow) {
  isNew.value = false
  editing.value = t
}
// SPEC §2 Adding looks alike: + New task opens the editor for the day (or Undated) I'm looking at.
const auth = useAuthStore()
function startNew() {
  isNew.value = true
  editing.value = {
    id: crypto.randomUUID(),
    user_id: auth.user?.id ?? '',
    title: '',
    due_date: view.value === 'undated' ? null : offset.value < 0 ? today.value : day.value,
    priority: DEFAULT_PRIORITY,
    status: 'open',
    source: 'manual',
    deleted_at: null,
  }
}
const route = useRoute()
const router = useRouter()
// The Priority tab's + New sits in the page heading like every other page's (CODING_STANDARDS §6).
const priorityList = ref<InstanceType<typeof PriorityTasks> | null>(null)
// Opened with ?priority=<id> (from the calendar): show the Priority tab and open that priority task.
const openPriority = ref<string | null>(null)
watch(
  () => route.query.priority,
  (id) => {
    if (typeof id !== 'string') return
    view.value = 'priority'
    openPriority.value = id
  },
  { immediate: true },
)
// Opened with ?task=<id> (from search or the calendar): show its day and open its editor.
watch(
  [() => route.query.task, all],
  ([id]) => {
    if (typeof id !== 'string') return
    const task = all.value.find((t) => t.id === id && !t.deleted_at)
    if (!task) return
    if (task.due_date) {
      view.value = 'day'
      day.value = task.due_date < today.value && task.status === 'open' ? today.value : task.due_date
    } else view.value = 'undated'
    edit(task)
    void router.replace({ query: {} })
  },
  { immediate: true },
)
async function saveEdit(t: TaskRow) {
  await brain.saveTask(t)
  editing.value = null
}
// SPEC §5 Tasks: a task that keeps slipping moves to tomorrow or Undated in one tap, with Undo.
async function move(t: TaskRow, dueDate: string | null) {
  await brain.saveTask(moveTask(t, dueDate))
  undo.offer(dueDate ? messages.undo.movedTomorrow(t.title) : messages.undo.movedUndated(t.title), () => brain.saveTask(t))
}

async function remove(t: TaskRow) {
  await brain.remove('tasks', t.id)
  if (editing.value?.id === t.id) editing.value = null
  undo.offer(messages.undo.deleted(t.title), () => brain.restore('tasks', t.id))
}

const tab = 'min-h-11 flex-1 rounded-xl px-3 text-sm font-medium'
// SPEC §2 Choices look alike: the chosen tab is the soft tint with a check mark.
const tabOn = [selected, 'border'].join(' ')
const dayArrow = 'flex size-11 items-center justify-center rounded-xl border border-line text-xl'
</script>
