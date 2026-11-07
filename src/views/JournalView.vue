<script setup lang="ts">
// SPEC §5 Journal: end-of-day check-in with the day's stats, tasks for tomorrow, and every past entry, always editable.
import { computed, onScopeDispose, ref, watch } from 'vue'
import JournalStatsCard from '@/components/JournalStatsCard.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { hasStats } from '@/journal/stats'
import { addDays } from '@/tasks/days'
import { messages } from '@/messages'
import type { JournalEntryRow, JournalStats } from '@/sync/types'

const brain = useBrainStore()
const m = messages.journal
const { today, timeZone } = useToday()

// A clock that ticks each minute, so today's stats follow habit deadlines without a reload.
const now = ref(new Date())
const tick = setInterval(() => (now.value = new Date()), 60_000)
onScopeDispose(() => clearInterval(tick))

const entries = useLiveQuery<JournalEntryRow[]>(
  async () => (brain.db ? (await brain.db.journal_entries.toArray()).filter((e) => !e.deleted_at) : []),
  [],
  [() => brain.db],
)
// Today's stats, live: recalculated whenever any of the day's data changes on this device.
const todayStats = useLiveQuery<JournalStats | null>(
  async () => (brain.db ? brain.journalStats(today.value, now.value, timeZone.value) : null),
  null,
  [() => brain.db, today, now],
)

// Write missed days, keep today's stats current, and freeze ended days.
watch(
  [today, () => brain.habitsReady, () => brain.db],
  () => {
    if (brain.db) void brain.refreshJournal(new Date(), timeZone.value).catch(() => {})
  },
  { immediate: true },
)

const todayEntry = computed(() => entries.value.find((e) => e.date === today.value))
const earlier = computed(() => entries.value.filter((e) => e.date < today.value).sort((a, b) => b.date.localeCompare(a.date)))

// ---------- Writing (saved as I type, and when I leave the box) ----------
const drafts = ref<Record<string, string>>({})
const savedDate = ref<string | null>(null)
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function draftOf(date: string, entry?: JournalEntryRow) {
  return drafts.value[date] ?? entry?.body ?? ''
}
function onInput(date: string, value: string) {
  drafts.value[date] = value
  savedDate.value = null
  clearTimeout(timers.get(date))
  timers.set(date, setTimeout(() => void save(date), 800))
}
async function save(date: string) {
  clearTimeout(timers.get(date))
  const body = drafts.value[date]
  if (body === undefined) return
  await brain.saveJournalBody(date, body, new Date(), timeZone.value)
  savedDate.value = date
}
onScopeDispose(() => {
  for (const date of Object.keys(drafts.value)) void save(date)
})

const editingDate = ref<string | null>(null)
async function finishEditing(date: string) {
  await save(date)
  editingDate.value = null
}

// ---------- Tasks for tomorrow ----------
const taskTitle = ref('')
const taskDate = ref<string>(addDays(today.value, 1))
watch(today, (t) => (taskDate.value = addDays(t, 1)))
const added = ref('')
async function addTask() {
  const title = taskTitle.value.trim()
  if (!title) return
  await brain.addJournalTask(title, taskDate.value || null)
  added.value = m.taskAdded(title)
  taskTitle.value = ''
}

function dayLabel(date: string) {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, mo! - 1, d!)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
const field = 'w-full rounded-xl border border-line bg-surface px-3 text-base text-ink'
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted italic">{{ m.subtitle }}</p>
    </div>

    <section class="flex flex-col gap-4 rounded-2xl border border-line p-4" data-testid="journal-today">
      <h2 class="text-lg font-semibold">{{ m.today }} · {{ dayLabel(today) }}</h2>
      <JournalStatsCard v-if="todayStats" :stats="todayStats" />

      <label class="flex flex-col gap-1">
        <span class="sr-only">{{ m.writeLabel }}</span>
        <textarea
          :value="draftOf(today, todayEntry)"
          :class="[field, 'min-h-36 py-2']"
          :placeholder="m.writePlaceholder"
          :aria-label="m.writeLabel"
          @input="onInput(today, ($event.target as HTMLTextAreaElement).value)"
          @blur="save(today)"
        />
      </label>
      <p v-if="savedDate === today" class="text-sm text-muted" role="status">{{ m.saved }}</p>

      <form class="flex flex-col gap-2" @submit.prevent="addTask">
        <label class="sr-only" for="journal-task">{{ m.addTaskLabel }}</label>
        <div class="flex gap-2">
          <input id="journal-task" v-model="taskTitle" :class="[field, 'min-h-12']" :placeholder="m.addTaskPlaceholder">
          <button type="submit" class="min-h-12 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.addTask }}</button>
        </div>
        <label class="flex items-center gap-2 text-sm text-muted">
          {{ m.addTaskDate }}
          <input v-model="taskDate" type="date" :class="[field, 'min-h-11 w-auto']" :aria-label="m.addTaskDate">
        </label>
        <p v-if="added" class="text-sm text-muted" role="status">{{ added }}</p>
      </form>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ m.olderHeading }}</h2>
      <p v-if="!earlier.length" class="text-muted">{{ m.empty }}</p>
      <article
        v-for="e in earlier"
        :key="e.id"
        class="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4"
        :data-testid="`journal-entry-${e.date}`"
      >
        <div class="flex items-center justify-between gap-2">
          <h3 class="font-semibold">{{ dayLabel(e.date) }}</h3>
          <button
            v-if="editingDate !== e.date"
            type="button"
            class="min-h-11 rounded-xl border border-line px-3 text-sm"
            @click="editingDate = e.date"
          >
            {{ m.edit }}
          </button>
        </div>
        <JournalStatsCard v-if="hasStats(e.stats)" :stats="e.stats" />
        <template v-if="editingDate === e.date">
          <textarea
            :value="draftOf(e.date, e)"
            :class="[field, 'min-h-28 py-2']"
            :placeholder="m.writePlaceholder"
            :aria-label="m.writeLabel"
            @input="onInput(e.date, ($event.target as HTMLTextAreaElement).value)"
          />
          <button type="button" class="min-h-11 self-start rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="finishEditing(e.date)">
            {{ m.done }}
          </button>
        </template>
        <p v-else-if="e.body.trim()" class="whitespace-pre-wrap">{{ e.body }}</p>
        <p v-else-if="e.auto" class="text-sm text-muted italic">{{ m.autoNote }}</p>
      </article>
    </section>
  </main>
</template>
