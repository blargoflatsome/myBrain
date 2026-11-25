<template>
  <form class="flex flex-col gap-8" @submit.prevent="save">
    <h1 class="text-2xl font-bold">{{ m.typeHeading }}</h1>
    <div v-if="notice" class="flex items-center gap-2 rounded-xl bg-surface p-3 text-ink">
      <p class="min-w-0 flex-1 [overflow-wrap:anywhere]" role="status" data-testid="capture-notice">{{ notice }}</p>
      <!-- Speaking again replaced what was here: put it back (SPEC §5 Speak it fills the form). -->
      <button v-if="beforeHeard" type="button" :class="smallButton" data-testid="capture-heard-undo" @click="undoHeard">{{ messages.undo.undo }}</button>
    </div>

    <!-- Post It: a small formatted note in place of the box (SPEC §5 Quick capture) -->
    <div v-if="type === 'postit'" class="flex flex-col gap-1" data-testid="capture-postit">
      <span class="pb-2 text-sm text-muted">{{ pm.label }}</span>
      <RichTextEditor :key="saves" v-model="postBody" :label="pm.label" :placeholder="pm.placeholder" min-height="8rem" autofocus @update:model-value="error = ''" />
    </div>

    <div v-if="type !== 'postit'" class="flex flex-col gap-1">
      <label for="capture-title" class="pb-2 text-sm text-muted">{{ type === 'later' ? m.placeholder : m.titleLabel }}</label>
      <div class="relative">
        <!-- Capture's own text box: the one field no other form has (CODING_STANDARDS §6). -->
        <!-- eslint-disable-next-line vue/no-restricted-html-elements -->
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
        <!-- eslint-disable-next-line vue/no-restricted-html-elements -->
        <input v-else id="capture-title" ref="titleBox" v-model="title" maxlength="500" :class="[fieldOnPage, 'pr-28 text-lg']" @input="error = ''">
        <button
          v-if="speech.supported"
          type="button"
          class="absolute top-2 right-2 min-h-9 rounded-full border border-line bg-bg px-3 text-sm text-ink"
          :aria-pressed="speech.listening.value"
          @click="speech.listening.value ? speech.stop() : speech.start()"
        >
          <AppIcon name="mic" /> {{ speech.listening.value ? m.micListening : m.micStart }}
        </button>
      </div>
      <p v-if="speech.failed.value" class="text-sm text-danger" role="alert">{{ m.micError }}</p>
    </div>

    <!-- SPEC §5 Quick capture: the type chips sit under the box, with Decide later chosen. -->
    <ChoiceChips :label="m.whereHeading" :options="typeOptions" :model-value="type" test-id="capture-types" @update:model-value="choose" />

    <PostItColors v-if="type === 'postit'" v-model="postColor" />

    <!-- The Vault: the shared Vault item form, the first bucket preselected (SPEC §5 Forms). -->
    <VaultItemFields
      v-if="type === 'vault'"
      v-model:bucket-id="bucketId"
      v-model:new-bucket-name="newBucketName"
      v-model:notes="notes"
      v-model:rating="rating"
      v-model:link="link"
      :buckets="buckets"
      :field-class="fieldOnPage"
      notes-test-id="capture-notes"
    />

    <!-- Task: the shared task form (SPEC §5 Forms). -->
    <TaskFields
      v-if="type === 'task'"
      v-model:due-date="dueDate"
      v-model:notes="notes"
      v-model:priority="priority"
      v-model:reminder-time="reminderTime"
      :reminder-error="reminderError"
      :field-class="fieldOnPage"
      notes-test-id="capture-notes"
    />

    <!-- Habit: the full habit form (SPEC §5 Quick capture) -->
    <HabitFields
      v-if="type === 'habit'"
      v-model:week-interval="habitInterval"
      v-model:monthly="habitMonthly"
      v-model:weekdays="habitDays"
      v-model:start-date="habitStart"
      v-model:notify-time="habitTime"
      v-model:timer="habitTimer"
      v-model:is-priority="habitPriority"
      :min-start="habitToday"
      :field-class="fieldOnPage"
    />

    <!-- Quest: the shared quest form, defaults Ugh / 30 min (SPEC §5 Forms). -->
    <div v-if="type === 'quest'" class="flex flex-col gap-8" data-testid="capture-quest">
      <QuestFields v-model:energy="energy" v-model:time="time" v-model:details="notes" details-test-id="capture-notes" />
    </div>

    <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
    <!-- SPEC §5 Quick capture: the Save button looks like every editor's and says what it saves. -->
    <button type="submit" :class="primaryButton" :disabled="saving" data-testid="capture-save">
      {{ m.saveAs[type] }}
    </button>
  </form>
</template>

<script setup lang="ts">
// SPEC §5 Quick capture: the text box first, then the type chips under it (Decide later chosen); choosing a type
// shows its fields and keeps what I typed. Only the title is required. Works offline.
// Shown in the Capture window over any page (CaptureDialog), and on the /capture page used for sharing from other apps.
import { useVisibleBuckets } from '@/vault/useVisibleBuckets'
import AppIcon from '@/components/AppIcon.vue'
import { computed, defineAsyncComponent, nextTick, onMounted, ref, toRaw, watch, type Ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import HabitFields from '@/habits/components/HabitFields.vue'
import ChoiceChips from '@/components/ChoiceChips.vue'
import PostItColors from '@/postits/components/PostItColors.vue'
import QuestFields from '@/quests/components/QuestFields.vue'
import TaskFields from '@/tasks/components/TaskFields.vue'
import { checkedReminder } from '@/tasks/actions'
import { DEFAULT_QUEST_ENERGY, DEFAULT_QUEST_TIME } from '@/quests/actions'
import { DEFAULT_PRIORITY } from '@/tasks/rules'
import VaultItemFields from '@/vault/components/VaultItemFields.vue'
import { deviceTimeZone, todayIn } from '@/time/days'
import { DEFAULT_POST_IT_COLOR } from '@/postits/rules'
import { plainText, storedNotes, textLines, toEditorHtml } from '@/journal/body'
import { useSpeech } from '@/composables/useSpeech'
import {
  splitTitle,
  CaptureError,
  type CaptureInput,
  type Destination,
} from '@/capture/capture'
import { messages } from '@/messages'
import type { EnergyLevel, PostItColor, TimeBucket } from '@/sync/types'
import { fieldOnPage, primaryButton, smallButton } from '@/ui/styles'
import { ownsBucket } from '@/vault/sharing'
import { dayLabel } from '@/ui/dates'
import type { VoiceCommand } from '@/voice/parse'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

const props = defineProps<{
  /** Text shared from another app (Web Share Target); it fills the box. */
  sharedInput?: string
}>()

const brain = useBrainStore()
const m = messages.capture
const pm = messages.postIts

// Post It (SPEC §5 Quick capture): a small formatted note and a color.
const postBody = ref('')
const postColor = ref<PostItColor>(DEFAULT_POST_IT_COLOR)

const type = ref<Destination>('later')
const title = ref('')
const notes = ref('')
const dueDate = ref('')
const priority = ref(DEFAULT_PRIORITY)
const reminderTime = ref('')
const reminderError = ref('')
const energy = ref<EnergyLevel>(DEFAULT_QUEST_ENERGY)
const time = ref<TimeBucket>(DEFAULT_QUEST_TIME)
const bucketId = ref<string | null>(null)
const newBucketName = ref<string | null>(null)
const rating = ref<number | null>(null)
const link = ref('')

const notice = ref('')
const error = ref('')
const saving = ref(false)
// Counts saves: a new Post It editor after each one, empty and focused, ready for the next note.
const saves = ref(0)
const titleBox = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const buckets = useVisibleBuckets()
// The first bucket is preselected, so only the title is required.
watch(buckets, (list) => {
  if (!bucketId.value || !list.some((b) => b.id === bucketId.value)) bucketId.value = list[0]?.id ?? null
})

const speech = useSpeech((heard) => void hear(heard))

onMounted(async () => {
  if (props.sharedInput) title.value = props.sharedInput
  await nextTick()
  titleBox.value?.focus()
})

/** Everything typed so far as plain lines, whatever the type. */
function typedText(): string {
  if (type.value === 'postit') return textLines(postBody.value)
  return [title.value.trim(), notes.value ? textLines(notes.value) : ''].filter(Boolean).join('\n')
}

// Choosing a type keeps what I typed: the first line is the title and the rest the notes or details (SPEC §5
// Quick capture). Between two types that both have a title and notes, both stay as they are, formatting and all.
function choose(d: Destination) {
  if (d === type.value) return
  const titled = (t: Destination) => t !== 'later' && t !== 'postit'
  if (!titled(type.value) || !titled(d)) {
    const text = typedText()
    title.value = ''
    notes.value = ''
    postBody.value = ''
    if (d === 'postit') postBody.value = toEditorHtml(text)
    else if (d === 'later') title.value = text
    else {
      const { title: first, rest } = splitTitle(text)
      title.value = first
      notes.value = rest
    }
  }
  type.value = d
  notice.value = ''
  beforeHeard.value = null
  error.value = ''
}

// Habit (SPEC §5 Quick capture: the full habit form).
const habitDays = ref<number[]>([0, 1, 2, 3, 4, 5, 6])
const habitInterval = ref(1)
const habitMonthly = ref(false)
const habitToday = todayIn(deviceTimeZone())
const habitStart = ref(habitToday)
const habitTime = ref('')
const habitTimer = ref<number | null>(null)
const habitPriority = ref(false)
function reset() {
  saves.value++
  postBody.value = ''
  postColor.value = DEFAULT_POST_IT_COLOR
  habitDays.value = [0, 1, 2, 3, 4, 5, 6]
  habitInterval.value = 1
  habitMonthly.value = false
  habitStart.value = habitToday
  habitTime.value = ''
  habitTimer.value = null
  habitPriority.value = false
  // The type stays chosen after a save, so I can add several of the same kind in a row (SPEC §5 Quick capture).
  title.value = ''
  notes.value = ''
  dueDate.value = ''
  priority.value = DEFAULT_PRIORITY
  reminderTime.value = ''
  reminderError.value = ''
  energy.value = DEFAULT_QUEST_ENERGY
  time.value = DEFAULT_QUEST_TIME
  newBucketName.value = null
  rating.value = null
  link.value = ''
  error.value = ''
}

// ---------- Speak it fills the form (SPEC §5 Quick capture) ----------
// Every part of the form, so speaking again can put back what was there.
const formState = {
  type, title, notes, dueDate, priority, reminderTime, energy, time, bucketId, newBucketName, rating, link, postBody, postColor,
  habitDays, habitInterval, habitMonthly, habitStart, habitTime, habitTimer, habitPriority,
}
type FormState = { [K in keyof typeof formState]: (typeof formState)[K]['value'] }
const snapshot = () => Object.fromEntries(Object.entries(formState).map(([k, r]) => [k, structuredClone(toRaw(r.value))])) as FormState
const beforeHeard = ref<FormState | null>(null)

/** The parser understands English only; other languages just fill the text box. */
const speaksEnglish = () => (navigator.language || 'en').toLowerCase().startsWith('en')

async function hear(heard: string) {
  // The parser brings the date library, so it loads only once something has been heard (CODING_STANDARDS §10).
  const command = speaksEnglish()
    ? (await import('@/voice/parse')).parseVoice(heard, {
        today: todayIn(deviceTimeZone()),
        buckets: buckets.value.map((b) => ({ id: b.id, name: b.name, mine: ownsBucket(b, brain.userId ?? '') })),
      })
    : null
  if (!command) {
    title.value = title.value ? `${title.value} ${heard}` : heard
    return
  }
  const had = !!(title.value.trim() || plainText(notes.value) || plainText(postBody.value))
  const before = had ? snapshot() : null
  fill(command)
  beforeHeard.value = before
  notice.value = m.heard(m.destinations[command.destination], command.title, command.dueDate ? dayLabel(command.dueDate) : null)
  await nextTick()
  titleBox.value?.focus()
}

/** Replace the form with what was heard; anything not said keeps its usual default. */
function fill(c: VoiceCommand) {
  reset()
  type.value = c.destination
  if (c.destination === 'postit') postBody.value = toEditorHtml(c.title)
  else title.value = c.title
  dueDate.value = c.dueDate ?? ''
  if (c.priority) priority.value = c.priority
  reminderTime.value = c.reminderTime ?? ''
  if (c.notifyTime) habitTime.value = c.notifyTime
  if (c.bucketId) bucketId.value = c.bucketId
}

function undoHeard() {
  const before = beforeHeard.value
  if (!before) return
  for (const k of Object.keys(before) as (keyof FormState)[]) (formState[k] as Ref<unknown>).value = before[k]
  saves.value++
  beforeHeard.value = null
  notice.value = ''
  titleBox.value?.focus()
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
  saving.value = true
  try {
    try {
      await brain.capture({ destination: 'postit', text: postBody.value, color: postColor.value })
    } catch (err) {
      // Formatting with no words in it is still an empty note.
      if (!(err instanceof CaptureError)) throw err
      error.value = pm.emptyError
      return
    }
    const message = brain.online ? m.saved.postit : m.savedOffline
    reset()
    beforeHeard.value = null
    notice.value = message
    await nextTick()
    titleBox.value?.focus()
  } finally {
    saving.value = false
  }
}

async function save() {
  error.value = ''
  if (type.value === 'postit') return savePostIt()
  if (!title.value.trim()) {
    error.value = m.emptyError
    titleBox.value?.focus()
    return
  }
  // SPEC §5 High-priority tasks: saving never sets a reminder off at once.
  reminderError.value = ''
  const reminder = type.value === 'task' ? checkedReminder({ priority: priority.value, due_date: dueDate.value, reminder_time: reminderTime.value }, null) : null
  if (reminder === 'past') {
    reminderError.value = messages.tasks.reminderPast
    return
  }
  saving.value = true
  try {
    if (type.value === 'vault' && newBucketName.value?.trim()) {
      bucketId.value = (await brain.createBucket(newBucketName.value)).id
    }
    const input: CaptureInput = {
      destination: type.value,
      text: title.value,
      notes: storedNotes(notes.value) ?? '',
      dueDate: dueDate.value || null,
      priority: priority.value,
      reminderTime: reminder,
      bucketId: bucketId.value ?? undefined,
      rating: rating.value,
      link: link.value,
      energy: energy.value,
      time: time.value,
      habit: {
        weekdays: habitDays.value,
        weekInterval: habitInterval.value,
        monthly: habitMonthly.value,
        startDate: habitStart.value,
        notifyTime: habitTime.value || null,
        // A timer without a reminder time is dropped by the habit rules (SPEC §5 Habits).
        timerMinutes: habitTimer.value,
        isPriority: habitPriority.value,
      },
    }
    try {
      await brain.capture(input)
    } catch (err) {
      // The reminder's minute can pass between the check above and the save.
      if (!(err instanceof CaptureError) || err.reason === 'bucket' || err.reason === 'bucket-name') throw err
      if (err.reason === 'reminder') reminderError.value = messages.tasks.reminderPast
      else error.value = m.emptyError
      return
    }
    const message = savedMessage(input)
    reset()
    beforeHeard.value = null
    notice.value = message
    await nextTick()
    titleBox.value?.focus()
  } finally {
    saving.value = false
  }
}

const types: Destination[] = ['task', 'vault', 'quest', 'habit', 'postit', 'later']
const typeOptions = types.map((d) => ({ value: d, label: m.destinations[d] }))
</script>
