<template>
  <form class="flex flex-col gap-8" @submit.prevent="save">
    <h1 class="text-2xl font-bold">{{ m.typeHeading }}</h1>
    <div v-if="notice" class="flex items-center gap-2 rounded-xl bg-surface p-3 text-ink">
      <p class="min-w-0 flex-1 [overflow-wrap:anywhere]" role="status" data-testid="capture-notice">{{ notice }}</p>
      <!-- Speaking again replaced what was here: put it back (SPEC §5 Speak it fills the form). -->
      <button v-if="beforeHeard" type="button" :class="smallButton" data-testid="capture-heard-undo" @click="undoHeard">{{ messages.undo.undo }}</button>
    </div>

    <!-- Post It: a small formatted note in place of the box (SPEC §5 Quick capture) -->
    <div v-if="type === 'postit'" v-field-error="postError" class="flex flex-col gap-1" data-testid="capture-postit">
      <span class="pb-2 text-sm text-muted">{{ pm.label }}</span>
      <RichTextEditor :key="saves" v-model="postBody" :label="pm.label" :placeholder="pm.placeholder" min-height="8rem" autofocus @update:model-value="postError.clear()" />
      <FieldError :of="postError" />
    </div>

    <div v-if="type !== 'postit'" class="flex flex-col gap-1">
      <label for="capture-title" class="pb-2 text-sm text-muted">{{ type === 'later' ? m.placeholder : m.titleLabel }}</label>
      <div v-field-error="titleError" class="relative">
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
        />
        <!-- eslint-disable-next-line vue/no-restricted-html-elements -->
        <input v-else id="capture-title" ref="titleBox" v-model="title" maxlength="500" :class="[fieldOnPage, 'pr-28 text-lg']">
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
      <FieldError :of="titleError" />
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
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue'
import { useBrainStore } from '@/stores/brain'
import HabitFields from '@/habits/components/HabitFields.vue'
import ChoiceChips from '@/components/ChoiceChips.vue'
import PostItColors from '@/postits/components/PostItColors.vue'
import QuestFields from '@/quests/components/QuestFields.vue'
import TaskFields from '@/tasks/components/TaskFields.vue'
import { checkedReminder } from '@/tasks/actions'
import VaultItemFields from '@/vault/components/VaultItemFields.vue'
import { deviceTimeZone, todayIn } from '@/time/days'
import { storedNotes } from '@/journal/body'
import { useCaptureDraft } from '@/capture/useCaptureDraft'
import FieldError from '@/components/FieldError.vue'
import { useFieldError, vFieldError } from '@/composables/useFieldError'
import { useSpeech } from '@/composables/useSpeech'
import { CaptureError, type CaptureInput, type Destination } from '@/capture/capture'
import { messages } from '@/messages'
import { fieldOnPage, primaryButton, smallButton } from '@/ui/styles'
import { ownsBucket } from '@/vault/sharing'
import { dayLabel } from '@/ui/dates'

// The formatting editor (Tiptap) is large, so it loads the first time it's shown, not with the app.
const RichTextEditor = defineAsyncComponent(() => import('@/components/RichTextEditor.vue'))

const props = defineProps<{
  /** Text shared from another app (Web Share Target); it fills the box. */
  sharedInput?: string
}>()

const brain = useBrainStore()
const m = messages.capture
const pm = messages.postIts

const draft = useCaptureDraft(deviceTimeZone())
const {
  type, title, notes, dueDate, priority, reminderTime, energy, time, bucketId, newBucketName, rating, link, postBody, postColor,
  habitDays, habitInterval, habitMonthly, habitStart, habitTime, habitTimer, habitPriority, beforeHeard,
} = draft
const habitToday = draft.today
// A new Post It editor whenever its text is replaced (after a save or an Undo), empty and focused for the next note.
const saves = draft.version

// SPEC §5 Forms: why Save was refused, beside the field it's about.
const titleError = useFieldError()
const postError = useFieldError()
const reminderError = useFieldError()
const notice = ref('')
const saving = ref(false)
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

// Choosing a type keeps what I typed (SPEC §5 Quick capture).
function choose(d: Destination) {
  if (d === type.value) return
  draft.choose(d)
  notice.value = ''
  clearErrors()
}

/** The next one starts fresh; the type stays chosen, so I can add several of the same kind in a row. */
function reset() {
  draft.clear()
  clearErrors()
}
function clearErrors() {
  for (const f of [titleError, postError, reminderError]) f.clear()
}

// ---------- Speak it fills the form (SPEC §5 Quick capture) ----------

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
  clearErrors()
  draft.heard(command)
  notice.value = m.heard(m.destinations[command.destination], command.title, command.dueDate ? dayLabel(command.dueDate) : null)
  await nextTick()
  titleBox.value?.focus()
}

function undoHeard() {
  draft.undoHeard()
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
      await postError.refuse(pm.emptyError)
      return
    }
    const message = brain.online ? m.saved.postit : m.savedOffline
    reset()
    notice.value = message
    await nextTick()
    titleBox.value?.focus()
  } finally {
    saving.value = false
  }
}

async function save() {
  clearErrors()
  if (type.value === 'postit') return savePostIt()
  if (!title.value.trim()) return titleError.refuse(m.emptyError)
  // SPEC §5 High-priority tasks: saving never sets a reminder off at once.
  const reminder = type.value === 'task' ? checkedReminder({ priority: priority.value, due_date: dueDate.value, reminder_time: reminderTime.value }, null) : null
  if (reminder === 'past') return reminderError.refuse(messages.tasks.reminderPast)
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
      await (err.reason === 'reminder' ? reminderError.refuse(messages.tasks.reminderPast) : titleError.refuse(m.emptyError))
      return
    }
    const message = savedMessage(input)
    reset()
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
