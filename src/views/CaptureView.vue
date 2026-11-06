<script setup lang="ts">
// SPEC §5 Quick capture: choose the type first, then a form made for it. Only the title is required. Works offline.
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useBrainStore } from '@/stores/brain'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useSpeech } from '@/composables/useSpeech'
import {
  DEFAULT_QUEST_ENERGY,
  DEFAULT_QUEST_TIME,
  DEFAULT_TASK_PRIORITY,
  sharedText,
  splitTitle,
  type CaptureInput,
  type Destination,
} from '@/capture/capture'
import { PRIORITIES } from '@/tasks/rules'
import { ENERGY_LEVELS, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'
import type { EnergyLevel, TimeBucket, VaultBucketRow } from '@/sync/types'

const brain = useBrainStore()
const route = useRoute()
const router = useRouter()
const m = messages.capture
const q = messages.quests
const t = messages.tasks

const type = ref<Destination | null>(null)
const title = ref('')
const notes = ref('')
const dueDate = ref('')
const priority = ref(DEFAULT_TASK_PRIORITY)
const energy = ref<EnergyLevel>(DEFAULT_QUEST_ENERGY)
const time = ref<TimeBucket>(DEFAULT_QUEST_TIME)
const bucketId = ref<string | null>(null)
const addingBucket = ref(false)
const newBucketName = ref('')
const shared = ref('')

const notice = ref('')
const error = ref('')
const saving = ref(false)
const titleBox = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const buckets = useLiveQuery<VaultBucketRow[]>(
  async () => (brain.db ? (await brain.db.vault_buckets.orderBy('position').toArray()).filter((b) => !b.deleted_at) : []),
  [],
  [() => brain.db],
)
// The first bucket is preselected, so only the title is required.
watch(buckets, (list) => {
  if (!bucketId.value || !list.some((b) => b.id === bucketId.value)) bucketId.value = list[0]?.id ?? null
})

const speech = useSpeech((heard) => {
  title.value = title.value ? `${title.value} ${heard}` : heard
})

onMounted(async () => {
  // SPEC §3: text shared from another app arrives in the query (Web Share Target) and waits while I pick the type.
  const text = sharedText(route.query)
  if (text) {
    shared.value = text
    await router.replace({ query: {} })
  }
})

async function choose(d: Destination) {
  type.value = d
  notice.value = ''
  error.value = ''
  if (shared.value) {
    if (d === 'later') title.value = shared.value
    else {
      const { title: first, rest } = splitTitle(shared.value)
      title.value = first
      notes.value = rest
    }
  }
  await nextTick()
  titleBox.value?.focus()
}

function reset() {
  type.value = null
  title.value = ''
  notes.value = ''
  dueDate.value = ''
  priority.value = DEFAULT_TASK_PRIORITY
  energy.value = DEFAULT_QUEST_ENERGY
  time.value = DEFAULT_QUEST_TIME
  addingBucket.value = false
  newBucketName.value = ''
  shared.value = ''
  error.value = ''
}

const bucketName = computed(() => buckets.value.find((b) => b.id === bucketId.value)?.name ?? m.destinations.vault)

function savedMessage(input: CaptureInput) {
  if (!brain.online) return m.savedOffline
  switch (input.destination) {
    case 'task':
      return input.dueDate ? m.saved.task : m.saved.taskUndated
    case 'vault':
      return m.saved.vault(bucketName.value)
    case 'quest':
      return m.saved.quest
    case 'later':
      return m.saved.later
  }
}

async function save() {
  if (!type.value) return
  error.value = ''
  if (!title.value.trim()) {
    error.value = m.emptyError
    titleBox.value?.focus()
    return
  }
  saving.value = true
  try {
    if (type.value === 'vault' && addingBucket.value && newBucketName.value.trim()) {
      bucketId.value = (await brain.createBucket(newBucketName.value)).id
    }
    const input: CaptureInput = {
      destination: type.value,
      text: title.value,
      notes: notes.value,
      dueDate: dueDate.value || null,
      priority: priority.value,
      bucketId: bucketId.value ?? undefined,
      energy: energy.value,
      time: time.value,
    }
    await brain.capture(input)
    const message = savedMessage(input)
    reset()
    notice.value = message
  } finally {
    saving.value = false
  }
}

const chip = (on: boolean) => [
  'min-h-11 rounded-full border px-3 text-sm',
  on ? 'border-accent bg-accent font-semibold text-accent-ink' : 'border-line bg-surface text-ink',
]
const field = 'min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink outline-none focus:border-accent'
const typeBtn = 'min-h-16 rounded-2xl border border-line bg-surface px-4 text-lg font-semibold text-ink active:scale-[0.98]'
const types: Destination[] = ['task', 'vault', 'quest', 'later']
const dot = { high: 'bg-red-500', medium: 'bg-yellow-400', low: 'bg-green-500' } as const
</script>

<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-6 pb-28">
    <template v-if="!type">
      <h1 class="text-2xl font-bold">{{ m.typeHeading }}</h1>
      <div v-if="shared" class="rounded-xl border border-line bg-surface p-3 text-sm">
        <p class="text-muted">{{ m.sharedPreview }}</p>
        <p class="whitespace-pre-wrap break-words" data-testid="shared-text">{{ shared }}</p>
      </div>
      <div class="grid grid-cols-2 gap-3" role="group" :aria-label="m.typeHeading">
        <button v-for="d in types" :key="d" type="button" :class="typeBtn" @click="choose(d)">
          {{ m.destinations[d] }}
        </button>
      </div>
      <p v-if="notice" class="rounded-xl bg-surface p-3 text-ink" role="status" data-testid="capture-notice">{{ notice }}</p>
    </template>

    <form v-else class="flex flex-col gap-4" @submit.prevent="save">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">{{ m.destinations[type] }}</h1>
        <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" @click="reset">{{ m.back }}</button>
      </div>

      <div class="flex flex-col gap-1">
        <label for="capture-title" class="text-sm text-muted">{{ type === 'later' ? m.placeholder : m.titleLabel }}</label>
        <div class="relative">
          <textarea
            v-if="type === 'later'"
            id="capture-title"
            ref="titleBox"
            v-model="title"
            rows="4"
            :placeholder="m.placeholder"
            :class="[field, 'resize-none py-3 pr-28 text-lg']"
            @input="error = ''"
          />
          <input v-else id="capture-title" ref="titleBox" v-model="title" :class="[field, 'pr-28 text-lg']" @input="error = ''">
          <button
            v-if="speech.supported"
            type="button"
            class="absolute top-2 right-2 min-h-9 rounded-full border border-line bg-bg px-3 text-sm text-ink"
            :aria-pressed="speech.listening.value"
            @click="speech.listening.value ? speech.stop() : speech.start()"
          >
            🎙 {{ speech.listening.value ? m.micListening : m.micStart }}
          </button>
        </div>
        <p v-if="speech.failed.value" class="text-sm text-danger" role="alert">{{ m.micError }}</p>
      </div>

      <!-- The Vault: bucket first-preselected, or a new one -->
      <fieldset v-if="type === 'vault'" class="flex flex-col gap-2">
        <legend class="mb-1 text-sm text-muted">{{ m.bucketLabel }}</legend>
        <div class="flex flex-wrap gap-2" role="group" :aria-label="m.bucketLabel">
          <button
            v-for="b in buckets"
            :key="b.id"
            type="button"
            :class="chip(!addingBucket && bucketId === b.id)"
            :aria-pressed="!addingBucket && bucketId === b.id"
            @click="(bucketId = b.id), (addingBucket = false)"
          >
            {{ b.name }}
          </button>
          <button type="button" :class="chip(addingBucket)" :aria-pressed="addingBucket" @click="addingBucket = true">
            + {{ m.newBucket }}
          </button>
        </div>
        <input v-if="addingBucket" v-model="newBucketName" :aria-label="m.newBucket" :placeholder="m.newBucket" :class="field">
      </fieldset>

      <label v-if="type !== 'later'" class="flex flex-col gap-1 text-sm text-muted">
        {{ type === 'quest' ? m.detailsLabel : m.notesLabel }}
        <textarea v-model="notes" rows="3" :class="[field, 'py-2']" />
      </label>

      <!-- Task: optional date, priority -->
      <template v-if="type === 'task'">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.taskDateLabel }}
          <input v-model="dueDate" type="date" :class="field">
          <span class="text-xs">{{ m.taskDateHint }}</span>
        </label>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ t.priorityLabel }}</legend>
          <div class="flex flex-wrap gap-2" role="group" :aria-label="t.priorityLabel">
            <button
              v-for="p in [...PRIORITIES].reverse()"
              :key="p.level"
              type="button"
              :class="chip(priority === p.level)"
              :aria-pressed="priority === p.level"
              @click="priority = p.level"
            >
              <span class="mr-1 inline-block size-2 rounded-full" :class="dot[p.key]" aria-hidden="true" />{{ t.priority[p.key] }}
            </button>
          </div>
        </fieldset>
      </template>

      <!-- Quest: energy and time, defaults Ugh / 30 min -->
      <template v-if="type === 'quest'">
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ q.editor.energy }}</legend>
          <div class="flex flex-wrap gap-2" role="group" :aria-label="q.editor.energy">
            <button v-for="e in ENERGY_LEVELS" :key="e" type="button" :class="chip(energy === e)" :aria-pressed="energy === e" @click="energy = e">
              {{ q.energy[e] }}
            </button>
          </div>
        </fieldset>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ q.editor.time }}</legend>
          <div class="flex flex-wrap gap-2" role="group" :aria-label="q.editor.time">
            <button v-for="tb in TIME_BUCKETS" :key="tb" type="button" :class="chip(time === tb)" :aria-pressed="time === tb" @click="time = tb">
              {{ q.time[tb] }}
            </button>
          </div>
        </fieldset>
      </template>

      <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
      <button type="submit" class="min-h-14 rounded-2xl bg-accent px-4 text-lg font-semibold text-accent-ink" :disabled="saving">
        {{ m.save }}
      </button>
    </form>
  </main>
</template>
