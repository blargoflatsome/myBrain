<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-5 pt-8 md:px-8 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.subtitle }}</p>
    </div>

    <section class="flex flex-col gap-4 rounded-2xl border border-line p-4" data-testid="journal-today">
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 class="text-lg font-semibold">{{ m.today }} · {{ shortDay(today) }}</h2>
        <SaveStatus :busy="isBusy(today)" :has-saved="!!todayEntry" />
      </div>
      <JournalStatsCard v-if="todayStats" :stats="todayStats" />
      <JournalBetter :key="today" :date="today" :entry="todayEntry" @busy="track(today, 'better', $event)" />

      <!-- SPEC §5 Locking my journal: on a device that hasn't unlocked it, the writing and editors wait. -->
      <UnlockJournal v-if="locked" />
      <p v-else-if="!lockKnown" class="text-muted" role="status" data-testid="journal-lock-checking">{{ lm.checking }}</p>
      <template v-else>
        <!-- SPEC §5 Celebrations: a soft glow around the writing when it's saved. -->
        <div class="rounded-xl" :class="{ 'celebrate-glow': glowing }" data-testid="journal-writing" :data-glowing="glowing || undefined">
          <RichTextEditor
            :model-value="draftOf(today, todayEntry)"
            :label="m.writeLabel"
            :placeholder="m.writePlaceholder"
            min-height="18rem"
            @update:model-value="onInput(today, $event)"
            @blur="save(today)"
          />
        </div>
        <SaveStatus class="-mt-2" :busy="busy.has(`${today}:body`)" :has-saved="!!todayEntry?.body" stamp test-id="save-status-writing" />
        <JournalTomorrow :key="today" :date="today" :entry="todayEntry" @busy="track(today, 'tomorrow', $event)" />
      </template>
    </section>


    <section class="flex flex-col gap-3">
      <h2 class="text-lg font-semibold">{{ m.olderHeading }}</h2>
      <p v-if="!earlier.length" class="text-muted">{{ m.empty }}</p>
      <article
        v-for="e in pageItems"
        :key="e.id"
        class="flex flex-col gap-3 rounded-2xl border bg-surface p-4"
        :class="highlight === e.date ? 'border-accent' : 'border-line'"
        :data-testid="`journal-entry-${e.date}`"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 class="font-semibold">
              <!-- SPEC §2 Rows look alike: tapping the day opens it for editing. -->
              <button v-if="editingDate !== e.date && !locked" type="button" class="min-h-11 text-left underline-offset-4 hover:underline" :aria-label="m.editLabel(shortDay(e.date))" data-testid="journal-edit" @click="editingDate = e.date">{{ shortDay(e.date) }}</button>
              <template v-else>{{ shortDay(e.date) }}</template>
            </h3>
            <SaveStatus v-if="editingDate === e.date" :busy="isBusy(e.date)" :has-saved="true" />
          </div>
        </div>
        <JournalStatsCard v-if="hasStats(e.stats)" :stats="e.stats" />
        <p v-if="editingDate !== e.date && e.better_than_yesterday != null" class="text-sm text-muted" data-testid="journal-better">
          {{ e.better_than_yesterday ? `✓ ${m.betterYes}` : m.betterNo }}
        </p>
        <template v-if="editingDate === e.date">
          <JournalBetter :date="e.date" :entry="e" @busy="track(e.date, 'better', $event)" />
          <RichTextEditor
            :model-value="draftOf(e.date, e)"
            :label="m.writeLabel"
            :placeholder="m.writePlaceholder"
            min-height="12rem"
            @update:model-value="onInput(e.date, $event)"
          />
          <SaveStatus class="-mt-2" :busy="busy.has(`${e.date}:body`)" :has-saved="true" test-id="save-status-writing" />
          <JournalTomorrow :date="e.date" :entry="e" min-height="12rem" @busy="track(e.date, 'tomorrow', $event)" />
          <button type="button" class="self-start" :class="primaryButtonSmall" @click="finishEditing(e.date)">
            {{ m.done }}
          </button>
        </template>
        <template v-else-if="isEncrypted(e.body)">
          <p v-if="!locked" class="text-sm text-muted" data-testid="journal-unreadable">{{ lm.couldNotOpen }}</p>
        </template>
        <!-- eslint-disable-next-line vue/no-v-html -- cleaned to the editor's own formatting by cleanHtml (DOMPurify) -->
        <div v-else-if="e.body.trim()" class="rich" data-testid="journal-body" v-html="cleanHtml(e.body)" />
        <p v-else-if="e.auto" class="text-sm text-muted">{{ m.autoNote }}</p>
        <div v-if="editingDate !== e.date && e.tomorrow?.trim() && !isEncrypted(e.tomorrow)" class="flex flex-col gap-1 text-sm" data-testid="journal-tomorrow">
          <span class="font-medium">{{ m.tomorrowLabel }}</span>
          <!-- eslint-disable-next-line vue/no-v-html -- cleaned to the editor's own formatting by cleanHtml (DOMPurify) -->
          <div class="rich" v-html="cleanHtml(e.tomorrow)" />
        </div>
      </article>
      <PageControls v-model:page="page" :page-count="pageCount" :label="m.olderHeading" />
    </section>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Journal: end-of-day check-in with the day's stats, formatted writing (full screen if wanted), and every
// past entry, always editable. Tasks for tomorrow are added with Capture, like anywhere else.
import { useNow } from '@/composables/useNow'
import { computed, defineAsyncComponent, nextTick, onScopeDispose, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import JournalStatsCard from '@/journal/components/JournalStatsCard.vue'
import JournalBetter from '@/journal/components/JournalBetter.vue'
import JournalTomorrow from '@/journal/components/JournalTomorrow.vue'
import SaveStatus from '@/journal/components/SaveStatus.vue'
import { onPageHide } from '@/composables/usePageHide'
import { useBrainStore } from '@/stores/brain'
import { useCelebrateStore } from '@/stores/celebrate'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useToday } from '@/composables/useToday'
import { hadActivity, hasStats } from '@/journal/stats'
import { cleanHtml } from '@/journal/body'
import { isEncrypted } from '@/journal/crypto'
import UnlockJournal from '@/journal/components/UnlockJournal.vue'
import { useJournalLock } from '@/journal/useJournalLock'
import { messages } from '@/messages'
import type { JournalEntryRow, JournalStats } from '@/sync/types'
import { shortDay } from '@/ui/dates'
import { live } from '@/sync/live'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { primaryButtonSmall } from '@/ui/styles'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

const EARLIER_PER_PAGE = 3
const brain = useBrainStore()
const celebrate = useCelebrateStore()
const glowing = ref(false)
let glowTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => celebrate.journalSaved,
  () => {
    if (celebrate.level === 'off') return
    glowing.value = true
    clearTimeout(glowTimer)
    glowTimer = setTimeout(() => (glowing.value = false), 1200)
  },
)
onScopeDispose(() => clearTimeout(glowTimer))
const m = messages.journal
const lm = messages.journalLock
const { locked, known: lockKnown } = useJournalLock()
const { today, timeZone } = useToday()

// A clock that ticks each minute, so today's stats follow habit deadlines without a reload.
const now = useNow()

const entries = useLiveQuery<JournalEntryRow[]>(
  async () => (brain.db ? live(await brain.db.journal_entries.toArray()) : []),
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
    .filter((e) => e.date < today.value && (e.body.trim() || e.tomorrow?.trim() || e.better_than_yesterday != null || (hasStats(e.stats) && hadActivity(e.stats))))
    .sort((a, b) => b.date.localeCompare(a.date)),
)
// Three days per page, newest first (SPEC §5 Journal).
const { page, pageCount, pageItems } = usePagination(earlier, EARLIER_PER_PAGE)

// ---------- Writing (saved as I type, and when I leave the editor) ----------
const drafts = ref<Record<string, string>>({})
const timers = new Map<string, ReturnType<typeof setTimeout>>()
// What's still being stored, per day ("2026-11-10:body"), for the save status next to each day's heading.
const busy = ref(new Set<string>())
function track(date: string, part: string, on: boolean) {
  const next = new Set(busy.value)
  if (on) next.add(`${date}:${part}`)
  else next.delete(`${date}:${part}`)
  busy.value = next
}
const isBusy = (date: string) => [...busy.value].some((k) => k.startsWith(`${date}:`))
function draftOf(date: string, entry?: JournalEntryRow) {
  return drafts.value[date] ?? entry?.body ?? ''
}
function onInput(date: string, value: string) {
  drafts.value[date] = value
  track(date, 'body', true)
  clearTimeout(timers.get(date))
  timers.set(date, setTimeout(() => void save(date), 800))
}
async function save(date: string) {
  clearTimeout(timers.get(date))
  const body = drafts.value[date]
  if (body === undefined) return
  await brain.saveJournalBody(date, body, new Date(), timeZone.value)
  track(date, 'body', false)
}
function saveAll() {
  for (const date of Object.keys(drafts.value)) void save(date)
}
onScopeDispose(saveAll)
// Phones may stop a hidden app, so writing waiting on the timer is stored as soon as I switch away (SPEC §7).
onPageHide(saveAll)


const editingDate = ref<string | null>(null)

// Opened with ?date=<day> (from search): scroll to that day's entry and highlight it.
const route = useRoute()
const highlight = ref<string | null>(null)
watch(
  [() => route.query.date, entries],
  async ([date]) => {
    if (typeof date !== 'string' || highlight.value === date || !entries.value.some((e) => e.date === date)) return
    highlight.value = date
    const at = earlier.value.findIndex((e) => e.date === date)
    if (at >= 0) page.value = Math.floor(at / EARLIER_PER_PAGE) + 1
    await nextTick()
    const el = document.querySelector(date === today.value ? '[data-testid="journal-today"]' : `[data-testid="journal-entry-${date}"]`)
    el?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  },
  { immediate: true },
)
async function finishEditing(date: string) {
  await save(date)
  editingDate.value = null
}

</script>
