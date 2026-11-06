<script setup lang="ts">
// SPEC §5 Random Quest: pick a project from the bucket list when bored, filtered by time and energy.
import { computed, ref } from 'vue'
import QuestEditor from '@/components/QuestEditor.vue'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { acceptQuest, ENERGY_LEVELS, finishQuest, markPicked, pickQuest, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'
import type { EnergyLevel, QuestRow, TimeBucket } from '@/sync/types'

const brain = useBrainStore()
const m = messages.quests

const all = useLiveQuery<QuestRow[]>(async () => (brain.db ? brain.db.quests.toArray() : []), [], [() => brain.db])
const live = computed(() => all.value.filter((q) => !q.deleted_at))
const open = computed(() => live.value.filter((q) => q.status === 'open'))
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
async function saveEdit(q: QuestRow) {
  await brain.saveQuest(q)
  editing.value = null
}
async function remove(q: QuestRow) {
  await brain.deleteQuest(q.id)
  if (currentId.value === q.id) currentId.value = null
  editing.value = null
}

const chip = (on: boolean) =>
  ['min-h-10 rounded-full border px-3 text-sm', on ? 'border-accent bg-accent text-accent-ink font-semibold' : 'border-line bg-surface text-ink']
const btn = 'min-h-12 rounded-xl border border-line bg-surface px-4 font-medium'
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-6 pb-28">
    <div>
      <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
      <p class="text-muted">{{ m.intro }}</p>
    </div>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm text-muted">{{ m.energyLabel }}</legend>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="m.energyLabel">
        <button type="button" :class="chip(!energy)" :aria-pressed="!energy" @click="energy = null">{{ m.any }}</button>
        <button v-for="e in ENERGY_LEVELS" :key="e" type="button" :class="chip(energy === e)" :aria-pressed="energy === e" @click="energy = e">
          {{ m.energy[e] }}
        </button>
      </div>
    </fieldset>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm text-muted">{{ m.timeLabel }}</legend>
      <div class="flex flex-wrap gap-2" role="group" :aria-label="m.timeLabel">
        <button type="button" :class="chip(!time)" :aria-pressed="!time" @click="time = null">{{ m.any }}</button>
        <button v-for="t in TIME_BUCKETS" :key="t" type="button" :class="chip(time === t)" :aria-pressed="time === t" @click="time = t">
          {{ m.time[t] }}
        </button>
      </div>
    </fieldset>

    <button type="button" class="min-h-14 rounded-2xl bg-accent px-4 text-lg font-semibold text-accent-ink" @click="pick">
      🎲 {{ m.pick }}
    </button>

    <section v-if="current" class="flex flex-col gap-3 rounded-2xl border-2 border-accent bg-surface p-4" data-testid="quest-result" aria-live="polite">
      <p class="text-sm text-muted">{{ m.resultHeading }}</p>
      <h2 class="text-xl font-bold">{{ current.title }}</h2>
      <p v-if="current.details" class="whitespace-pre-wrap">{{ current.details }}</p>
      <p class="flex flex-wrap gap-2 text-sm text-muted">
        <span v-if="current.time_bucket">⏱ {{ m.time[current.time_bucket] }}</span>
        <span v-if="current.energy_level">⚡ {{ m.energy[current.energy_level] }}</span>
        <span v-if="(current.times_picked ?? 0) > 1">{{ m.pickedCount((current.times_picked ?? 1) - 1) }}</span>
      </p>
      <div class="grid grid-cols-3 gap-2">
        <button type="button" class="min-h-12 rounded-xl bg-accent px-2 font-semibold text-accent-ink" @click="accept(current)">{{ m.accept }}</button>
        <button type="button" :class="btn" @click="pick">{{ m.reroll }}</button>
        <button type="button" :class="btn" @click="finish(current)">{{ m.done }}</button>
      </div>
    </section>
    <p v-if="notice" class="rounded-xl bg-surface p-3" role="status" data-testid="quest-notice">{{ notice }}</p>

    <section v-if="inProgress.length" class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.inProgress }}</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="q in inProgress" :key="q.id" class="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
          <span class="flex-1">{{ q.title }}</span>
          <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" :aria-label="`${m.done}: ${q.title}`" @click="finish(q)">
            {{ m.done }}
          </button>
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-2">
      <h2 class="text-lg font-semibold">{{ m.allHeading }}</h2>
      <p v-if="!open.length" class="text-muted">{{ m.empty }}</p>
      <ul class="flex flex-col gap-2">
        <li v-for="q in open" :key="q.id">
          <button type="button" class="flex w-full flex-col items-start gap-1 rounded-2xl border border-line bg-surface p-3 text-left" @click="editing = q">
            <span>{{ q.title }}</span>
            <span class="flex gap-3 text-xs text-muted">
              <span v-if="q.time_bucket">⏱ {{ m.time[q.time_bucket] }}</span>
              <span v-if="q.energy_level">⚡ {{ m.energy[q.energy_level] }}</span>
            </span>
          </button>
        </li>
      </ul>
    </section>

    <QuestEditor :quest="editing" @save="saveEdit" @delete="remove" @close="editing = null" />
  </main>
</template>
