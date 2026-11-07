<script setup lang="ts">
// SPEC §5 Journal: end-of-day check-in with the day's stats, formatted writing (full screen if wanted), tasks for
// tomorrow in the Capture window (without leaving the page), and every past entry, always editable.
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import JournalStatsCard from '@/components/JournalStatsCard.vue'
import RichTextEditor from '@/components/RichTextEditor.vue'
import EntryTags from '@/components/EntryTags.vue'
import { useBrainStore } from '@/stores/brain'
import { useCaptureStore } from '@/stores/capture'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { entryIdFor, hadActivity, hasStats } from '@/journal/stats'
import { cleanHtml } from '@/journal/body'
import { addDays } from '@/tasks/days'
import { messages } from '@/messages'
import type { JournalEntryRow, JournalStats } from '@/sync/types'

const brain = useBrainStore()
const capture = useCaptureStore()
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

// Write missed days (if I did something), keep today's stats current, and freeze ended days.
watch(
  [today, () => brain.habitsReady, () => brain.db],
  () => {
    if (brain.db) void brain.refreshJournal(new Date(), timeZone.value).catch(() => {})
  },
  { immediate: true },
)

const todayEntry = computed(() => entries.value.find((e) => e.date === today.value))
// Past entries; a day with no writing and nothing done is not shown (SPEC §5 Journal: entries only when I did something).
const earlier = computed(() =>
  entries.value
    .filter((e) => e.date < today.value && (e.body.trim() || (hasStats(e.stats) && hadActivity(e.stats))))
    .sort((a, b) => b.date.localeCompare(a.date)),
)

// ---------- Writing (saved as I type, and when I leave the editor) ----------
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

// Opened with ?date=<day> (from search): scroll to that day's entry and highlight it.
const route = useRoute()
const highlight = ref<string | null>(null)
watch(
  [() => route.query.date, entries],
  async ([date]) => {
    if (typeof date !== 'string' || highlight.value === date || !entries.value.some((e) => e.date === date)) return
    highlight.value = date
    await nextTick()
    const el = document.querySelector(date === today.value ? '[data-testid="journal-today"]' : `[data-testid="journal-entry-${date}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  },
  { immediate: true },
)
async function finishEditing(date: string) {
  await save(date)
  editingDate.value = null
}

// ---------- Tasks for tomorrow: the Capture window, with Task chosen and tomorrow's date; I stay on the Journal ----------
function addTask() {
  capture.open({ due: addDays(today.value, 1), source: 'journal' })
}

function dayLabel(date: string) {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y!, mo! - 1, d!)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
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

      <RichTextEditor
        :model-value="draftOf(today, todayEntry)"
        :label="m.writeLabel"
        :placeholder="m.writePlaceholder"
        min-height="18rem"
        @update:model-value="onInput(today, $event)"
        @blur="save(today)"
      />
      <p v-if="savedDate === today" class="text-sm text-muted" role="status">{{ m.saved }}</p>
      <EntryTags v-if="brain.userId" type="journal_entry" :item-id="entryIdFor(brain.userId, today)" />
    </section>

    <section class="rounded-2xl border border-line p-4" data-testid="journal-add-task">
      <button type="button" class="min-h-12 w-full rounded-xl border border-line bg-surface px-4 font-medium" @click="addTask">
        {{ m.addTask }}
      </button>
    </section>

    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ m.olderHeading }}</h2>
      <p v-if="!earlier.length" class="text-muted">{{ m.empty }}</p>
      <article
        v-for="e in earlier"
        :key="e.id"
        class="flex flex-col gap-3 rounded-2xl border bg-surface p-4"
        :class="highlight === e.date ? 'border-accent' : 'border-line'"
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
          <RichTextEditor
            :model-value="draftOf(e.date, e)"
            :label="m.writeLabel"
            :placeholder="m.writePlaceholder"
            min-height="12rem"
            @update:model-value="onInput(e.date, $event)"
          />
          <EntryTags type="journal_entry" :item-id="e.id" />
          <button type="button" class="min-h-11 self-start rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="finishEditing(e.date)">
            {{ m.done }}
          </button>
        </template>
        <!-- eslint-disable-next-line vue/no-v-html -- cleaned to the editor's own formatting by cleanHtml (DOMPurify) -->
        <div v-else-if="e.body.trim()" class="rich" data-testid="journal-body" v-html="cleanHtml(e.body)" />
        <p v-else-if="e.auto" class="text-sm text-muted italic">{{ m.autoNote }}</p>
      </article>
    </section>
  </main>
</template>
