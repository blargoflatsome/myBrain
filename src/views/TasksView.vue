<script setup lang="ts">
// SPEC §5 Tasks: daily list (with carry-over), scheduling for other days, and the Undated list.
import { computed, ref, watch } from 'vue'
import TaskItem from '@/components/TaskItem.vue'
import TaskEditor from '@/components/TaskEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { addDays, daysBetween } from '@/tasks/days'
import { cancelTask, tasksForDay, toggleDone, undatedTasks } from '@/tasks/rules'
import { messages } from '@/messages'
import type { TaskRow } from '@/sync/types'

const brain = useBrainStore()
const m = messages.tasks
const { today, timeZone } = useToday()

const view = ref<'day' | 'undated'>('day')
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
  const [y, mo, d] = day.value.split('-').map(Number)
  return new Date(y!, mo! - 1, d!).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
})

const emptyText = computed(() => {
  if (view.value === 'undated') return m.emptyUndated
  if (offset.value < 0) return m.emptyPast
  return offset.value === 0 ? m.emptyToday : m.emptyFuture
})
const allDoneToday = computed(
  () => view.value === 'day' && offset.value === 0 && list.value.length > 0 && list.value.every((t) => t.status === 'done'),
)

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
async function saveEdit(t: TaskRow) {
  await brain.saveTask(t)
  editing.value = null
}
async function remove(t: TaskRow) {
  await brain.deleteTask(t.id)
  editing.value = null
}

const tab = 'min-h-11 flex-1 rounded-xl px-3 text-sm font-medium'
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-6 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted italic" data-testid="tasks-intro">{{ m.intro }}</p>
    </div>
    <div class="flex gap-2 rounded-2xl bg-surface p-1" role="tablist">
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'day'"
        :class="[tab, view === 'day' ? 'bg-accent text-accent-ink' : 'text-muted']"
        @click="view = 'day'"
      >
        {{ m.todayHeading }}
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="view === 'undated'"
        :class="[tab, view === 'undated' ? 'bg-accent text-accent-ink' : 'text-muted']"
        @click="view = 'undated'"
      >
        {{ m.undatedHeading }}
      </button>
    </div>

    <div v-if="view === 'day'" class="flex items-center justify-between">
      <button type="button" class="min-h-11 min-w-11 rounded-xl text-xl" :aria-label="m.day.previous" @click="day = addDays(day, -1)">‹</button>
      <button type="button" class="text-xl font-bold" @click="day = today">
        <h2>{{ dayLabel }}</h2>
      </button>
      <button type="button" class="min-h-11 min-w-11 rounded-xl text-xl" :aria-label="m.day.next" @click="day = addDays(day, 1)">›</button>
    </div>
    <h2 v-else class="text-xl font-bold">{{ m.undatedHeading }}</h2>

    <form v-if="canAdd" class="flex gap-2" @submit.prevent="add">
      <input
        v-model="newTitle"
        :placeholder="addLabel"
        :aria-label="addLabel"
        class="min-h-12 flex-1 rounded-xl border border-line bg-surface px-3 text-base text-ink"
      >
      <button type="submit" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.add }}</button>
    </form>

    <p v-if="view === 'day' && offset === 0 && list.length && !allDoneToday" class="text-muted">{{ m.pastYouToday }}</p>
    <p v-if="allDoneToday" class="text-muted" role="status">{{ m.allDone }}</p>
    <p v-if="!list.length" class="text-muted">{{ emptyText }}</p>

    <ul class="flex flex-col gap-2">
      <TaskItem
        v-for="t in list"
        :key="t.id"
        :task="t"
        :today="today"
        @toggle="brain.saveTask(toggleDone(t))"
        @edit="editing = t"
        @cancel="brain.saveTask(cancelTask(t))"
      />
    </ul>

    <TaskEditor :task="editing" @save="saveEdit" @delete="remove" @close="editing = null" />
  </main>
</template>
