<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.intro }}</p>
    </div>

    <!-- The picker: what I have the energy and time for, then pick. -->
    <section class="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4" data-testid="quest-picker">
      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{{ m.energyLabel }}</legend>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="m.energyLabel">
          <button type="button" :class="filterChip(!energy)" :aria-pressed="!energy" @click="energy = null">
            <span v-if="!energy" aria-hidden="true">✓ </span>{{ m.any }}
          </button>
          <button v-for="e in ENERGY_LEVELS" :key="e" type="button" :class="filterChip(energy === e)" :aria-pressed="energy === e" @click="energy = e">
            <span v-if="energy === e" aria-hidden="true">✓ </span>{{ m.energy[e] }}
          </button>
        </div>
      </fieldset>

      <fieldset class="flex flex-col gap-2">
        <legend class="mb-1 text-sm font-medium">{{ m.timeLabel }}</legend>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="m.timeLabel">
          <button type="button" :class="filterChip(!time)" :aria-pressed="!time" @click="time = null">
            <span v-if="!time" aria-hidden="true">✓ </span>{{ m.any }}
          </button>
          <button v-for="t in TIME_BUCKETS" :key="t" type="button" :class="filterChip(time === t)" :aria-pressed="time === t" @click="time = t">
            <span v-if="time === t" aria-hidden="true">✓ </span>{{ m.time[t] }}
          </button>
        </div>
      </fieldset>

      <button type="button" class="min-h-12 self-start rounded-xl bg-accent px-5 font-semibold text-accent-ink" @click="pick">
        <span aria-hidden="true">🎲 </span>{{ m.pick }}
      </button>
    </section>

    <section v-if="current" class="flex flex-col gap-3 rounded-2xl border border-line border-l-4 border-l-accent bg-surface p-4" data-testid="quest-result" aria-live="polite">
      <p class="text-sm text-muted">{{ m.resultHeading }}</p>
      <h2 class="text-xl font-semibold">{{ current.title }}</h2>
      <p v-if="current.details" class="whitespace-pre-wrap">{{ current.details }}</p>
      <p class="flex flex-wrap gap-2 text-sm">
        <span v-if="current.energy_level" :class="tag">{{ m.energy[current.energy_level] }}</span>
        <span v-if="current.time_bucket" :class="tag">{{ m.time[current.time_bucket] }}</span>
        <span v-if="(current.times_picked ?? 0) > 1" class="text-muted">{{ m.pickedCount((current.times_picked ?? 1) - 1) }}</span>
      </p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="accept(current)">{{ m.accept }}</button>
        <button type="button" :class="quiet" @click="pick">{{ m.reroll }}</button>
        <button type="button" :class="quiet" @click="finish(current)">{{ m.done }}</button>
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
        <li v-for="q in pageItems" :key="q.id">
          <button type="button" class="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left hover:bg-bg" @click="editing = q">
            <span class="min-w-0 flex-1" data-testid="quest-title">{{ q.title }}</span>
            <span class="flex shrink-0 gap-1.5 text-xs">
              <span v-if="q.energy_level" :class="tag">{{ m.energy[q.energy_level] }}</span>
              <span v-if="q.time_bucket" :class="tag">{{ m.time[q.time_bucket] }}</span>
            </span>
          </button>
        </li>
      </ul>
      <PageControls v-model:page="page" :page-count="pageCount" :label="m.allHeading" />
    </section>

    <QuestEditor :quest="editing" @save="saveEdit" @delete="remove" @close="editing = null" />
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Random Quest: pick a project from the bucket list when bored, filtered by time and energy.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QuestEditor from '@/components/QuestEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { acceptQuest, byEffort, ENERGY_LEVELS, finishQuest, markPicked, pickQuest, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'
import PageControls from '@/components/PageControls.vue'
import { usePagination } from '@/composables/usePagination'
import { filterChip } from '@/ui/styles'

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
const notice = ref('')

async function pick() {
  notice.value = ''
  const choice = pickQuest(live.value, { energy: energy.value, time: time.value })
  if (!choice) {
    currentId.value = null
    notice.value = m.nothingFits
    return
  }
  await brain.saveQuest(markPicked(choice))
  currentId.value = choice.id
}

async function accept(q: QuestRow) {
  await brain.saveQuest(acceptQuest(q))
  currentId.value = null
  notice.value = m.accepted
}

async function finish(q: QuestRow) {
  await brain.saveQuest(finishQuest(q))
  if (currentId.value === q.id) currentId.value = null
  notice.value = m.finished
}

const editing = ref<QuestRow | null>(null)
// Opened with ?quest=<id> (from search): open that quest's editor.
const route = useRoute()
const router = useRouter()
watch(
  [() => route.query.quest, all],
  ([id]) => {
    if (typeof id !== 'string') return
    const quest = all.value.find((q) => q.id === id && !q.deleted_at)
    if (!quest) return
    editing.value = quest
    void router.replace({ query: {} })
  },
  { immediate: true },
)
async function saveEdit(q: QuestRow) {
  await brain.saveQuest(q)
  editing.value = null
}
async function remove(q: QuestRow) {
  await brain.deleteQuest(q.id)
  if (currentId.value === q.id) currentId.value = null
  editing.value = null
}

const quiet = 'min-h-11 rounded-xl border border-line px-4'
/** A small grey label for energy and time. */
const tag = 'rounded-full bg-bg px-2 py-0.5 text-muted'
</script>
