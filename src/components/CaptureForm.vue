<template>
  <div class="flex flex-col gap-4">
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
      <p v-if="notice" class="rounded-xl bg-surface p-3 text-ink" role="status" data-testid="capture-notice">{{ notice }}</p>

      <!-- Post It: a small formatted note and its color (SPEC §5 Quick capture) -->
      <template v-if="type === 'postit'">
        <div class="flex flex-col gap-1" data-testid="capture-postit">
          <span class="text-sm text-muted">{{ pm.label }}</span>
          <RichTextEditor v-model="postBody" :label="pm.label" :placeholder="pm.placeholder" min-height="8rem" autofocus @update:model-value="error = ''" />
        </div>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ pm.color }}</legend>
          <div class="flex flex-wrap gap-2" role="radiogroup" :aria-label="pm.color">
            <button
              v-for="c in POST_IT_COLORS"
              :key="c"
              type="button"
              role="radio"
              :aria-checked="postColor === c"
              :class="['min-h-11 rounded-full border-2 px-4 text-sm font-medium', `note-${c}`, postColor === c ? 'border-ink' : 'border-transparent']"
              @click="postColor = c"
            >
              <span v-if="postColor === c" aria-hidden="true">✓ </span>{{ pm.colors[c] }}
            </button>
          </div>
        </fieldset>
      </template>

      <div v-if="type !== 'postit'" class="flex flex-col gap-1">
        <label for="capture-title" class="text-sm text-muted">{{ type === 'later' ? m.placeholder : m.titleLabel }}</label>
        <div class="relative">
          <textarea
            v-if="type === 'later'"
            id="capture-title"
            ref="titleBox"
            v-model="title"
            maxlength="20000"
            rows="4"
            :placeholder="m.placeholder"
            :class="[fieldOnPage, 'resize-none py-3 pr-28 text-lg']"
            @input="error = ''"
          />
          <input v-else id="capture-title" ref="titleBox" v-model="title" maxlength="500" :class="[fieldOnPage, 'pr-28 text-lg']" @input="error = ''">
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
        <input v-if="addingBucket" v-model="newBucketName" maxlength="200" :aria-label="m.newBucket" :placeholder="m.newBucket" :class="fieldOnPage">
      </fieldset>

      <label v-if="type !== 'later' && type !== 'habit' && type !== 'postit'" class="flex flex-col gap-1 text-sm text-muted">
        {{ type === 'quest' ? m.detailsLabel : m.notesLabel }}
        <textarea v-model="notes" maxlength="20000" rows="3" :class="[fieldOnPage, 'py-2']" />
      </label>

      <!-- Task: optional date, priority -->
      <template v-if="type === 'task'">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.taskDateLabel }}
          <input v-model="dueDate" type="date" :class="fieldOnPage">
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

      <!-- Habit: the full habit form (SPEC §5 Quick capture) -->
      <template v-if="type === 'habit'">
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1 text-sm text-muted">{{ h.editor.weekdays }}</legend>
          <div class="flex flex-wrap gap-1.5" role="group" :aria-label="h.editor.weekdays">
            <button
              v-for="d in [0, 1, 2, 3, 4, 5, 6]"
              :key="d"
              type="button"
              :class="chip(habitDays.includes(d))"
              :aria-pressed="habitDays.includes(d)"
              @click="toggleHabitDay(d)"
            >
              {{ h.weekdayNames[d] }}
            </button>
          </div>
        </fieldset>
        <HowOften v-model="habitInterval" />
        <div class="grid grid-cols-2 gap-3">
          <TimeInput v-model="habitTime" :label="h.editor.notifyTime" :input-class="fieldOnPage" />
          <label class="flex flex-col gap-1 text-sm text-muted">
            {{ h.editor.timer }}
            <select v-model="habitTimer" :class="fieldOnPage" :disabled="!habitTime">
              <option value="">{{ h.editor.timerNone }}</option>
              <option v-for="mins in [15, 30, 60, 120, 180, 240]" :key="mins" :value="String(mins)">{{ h.editor.timerOptions[mins] }}</option>
            </select>
          </label>
        </div>
        <label class="flex items-start gap-3 text-sm">
          <input v-model="habitPrivate" type="checkbox" class="mt-0.5 size-5 accent-[var(--accent)]">
          <span><span class="font-medium">{{ h.editor.private }}</span><span class="block text-xs text-muted">{{ h.editor.privateHint }}</span></span>
        </label>
        <label class="flex items-start gap-3 text-sm">
          <input v-model="habitPriority" type="checkbox" class="mt-0.5 size-5 accent-[var(--accent)]">
          <span><span class="font-medium">{{ h.editor.priority }}</span><span class="block text-xs text-muted">{{ h.editor.priorityHint }}</span></span>
        </label>
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
  </div>
</template>

<script setup lang="ts">
// SPEC §5 Quick capture: choose the type first, then a form made for it. Only the title is required. Works offline.
// Shown in the Capture window over any page (CaptureDialog), and on the /capture page used for sharing from other apps.
import TimeInput from '@/components/TimeInput.vue'
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import HowOften from '@/components/HowOften.vue'
import { DEFAULT_POST_IT_COLOR, POST_IT_COLORS } from '@/postits/rules'
import { plainText, toEditorHtml } from '@/journal/body'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { useSpeech } from '@/composables/useSpeech'
import {
  DEFAULT_QUEST_ENERGY,
  DEFAULT_QUEST_TIME,
  DEFAULT_TASK_PRIORITY,
  splitTitle,
  type CaptureInput,
  type Destination,
} from '@/capture/capture'
import { PRIORITIES } from '@/tasks/rules'
import { ENERGY_LEVELS, TIME_BUCKETS } from '@/quests/picker'
import { messages } from '@/messages'
import type { EnergyLevel, PostItColor, TimeBucket, VaultBucketRow } from '@/sync/types'
import { chip, fieldOnPage } from '@/ui/styles'
import { activeBuckets } from '@/vault/rules'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

const props = defineProps<{
  /** Text shared from another app (Web Share Target), waiting while I pick the type. */
  sharedInput?: string
}>()

const brain = useBrainStore()
const m = messages.capture
const q = messages.quests
const t = messages.tasks
const h = messages.habits
const pm = messages.postIts

// Post It (SPEC §5 Quick capture): a small formatted note and a color.
const postBody = ref('')
const postColor = ref<PostItColor>(DEFAULT_POST_IT_COLOR)

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
  async () => (brain.db ? activeBuckets(await brain.db.vault_buckets.toArray()) : []),
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
  if (props.sharedInput) shared.value = props.sharedInput
})

async function choose(d: Destination) {
  type.value = d
  notice.value = ''
  error.value = ''
  if (shared.value) {
    if (d === 'postit') postBody.value = toEditorHtml(shared.value)
    else if (d === 'later') title.value = shared.value
    else {
      const { title: first, rest } = splitTitle(shared.value)
      title.value = first
      notes.value = rest
    }
  }
  await nextTick()
  // A Post It's editor focuses itself once it's ready.
  if (d !== 'postit') titleBox.value?.focus()
}

// Habit (SPEC §5 Quick capture: the full habit form).
const habitDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6])
const habitInterval = ref(1)
const habitTime = ref('')
const habitTimer = ref('')
const habitPrivate = ref(false)
const habitPriority = ref(false)
function toggleHabitDay(d: number) {
  const has = habitDays.value.includes(d)
  if (has && habitDays.value.length === 1) return
  habitDays.value = has ? habitDays.value.filter((x) => x !== d) : [...habitDays.value, d].sort()
}

function reset() {
  postBody.value = ''
  postColor.value = DEFAULT_POST_IT_COLOR
  habitDays.value = [0, 1, 2, 3, 4, 5, 6]
  habitInterval.value = 1
  habitTime.value = ''
  habitTimer.value = ''
  habitPrivate.value = false
  habitPriority.value = false
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
    case 'habit':
      return m.saved.habit
    case 'later':
      return m.saved.later
    case 'postit':
      return m.saved.postit
  }
}

async function savePostIt() {
  if (!plainText(postBody.value)) {
    error.value = pm.emptyError
    return
  }
  saving.value = true
  try {
    await brain.addPostIt(postBody.value, postColor.value)
    const message = brain.online ? m.saved.postit : m.savedOffline
    reset()
    notice.value = message
  } finally {
    saving.value = false
  }
}

async function save() {
  if (!type.value) return
  error.value = ''
  if (type.value === 'postit') return savePostIt()
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
      habit: {
        weekdays: habitDays.value,
        weekInterval: habitInterval.value,
        notifyTime: habitTime.value || null,
        timerMinutes: habitTimer.value ? Number(habitTimer.value) : null,
        isPrivate: habitPrivate.value,
        isPriority: habitPriority.value,
      },
    }
    await brain.capture(input)
    const message = savedMessage(input)
    reset()
    notice.value = message
  } finally {
    saving.value = false
  }
}

const typeBtn = 'min-h-16 rounded-2xl border border-line bg-surface px-4 text-lg font-semibold text-ink active:scale-[0.98]'
const types: Destination[] = ['task', 'vault', 'quest', 'habit', 'postit', 'later']
const dot = { high: 'bg-red-500', medium: 'bg-yellow-400', low: 'bg-green-500' } as const
</script>
