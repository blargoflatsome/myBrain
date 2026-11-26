<template>
  <div class="tv-overlay" data-testid="tv-quest" @mousedown.self="downOutside = true" @click.self="clickOutside">
    <section ref="box" class="tv-popup" role="dialog" aria-modal="true" aria-labelledby="tv-quest-heading" @mousedown="downOutside = false">
      <div class="tv-popup-bar">
        <h2 id="tv-quest-heading" class="tv-panel-heading">{{ tv.questHeading }}</h2>
        <button type="button" class="tv-button tv-arrow" :aria-label="close" data-testid="tv-quest-close" @click="emit('close')">✕</button>
      </div>
      <p v-if="quest.trouble.value" class="tv-note" role="status" data-testid="tv-quest-trouble">{{ tv.offline }}</p>

      <fieldset v-for="f in filters" :key="f.label" class="tv-filter">
        <legend class="tv-filter-label">{{ f.label }}</legend>
        <button type="button" class="tv-button tv-chip" :aria-pressed="!f.value()" @click="f.set(null)">
          <span v-if="!f.value()" aria-hidden="true">✓ </span>{{ m.any }}
        </button>
        <button v-for="o in f.options" :key="o.value" type="button" class="tv-button tv-chip" :aria-pressed="f.value() === o.value" @click="f.set(o.value)">
          <span v-if="f.value() === o.value" aria-hidden="true">✓ </span>{{ o.label }}
        </button>
      </fieldset>
      <button ref="pickButton" type="button" class="tv-button tv-quest-pick" :aria-disabled="quest.busy.value" data-testid="tv-quest-pick" @click="run(quest.pick)">
        {{ m.pick }}
      </button>

      <div v-if="shownQuest" class="tv-quest-result" aria-live="polite" data-testid="tv-quest-result">
        <p class="tv-muted">{{ m.resultHeading }}</p>
        <h3 class="tv-quest-title" data-testid="tv-quest-title">{{ shownQuest.title }}</h3>
        <RichNotes class="tv-quest-notes" :value="shownQuest.details" />
        <p class="tv-quest-tags">
          <span v-if="shownQuest.energy_level" class="tv-tag">{{ m.energy[shownQuest.energy_level] }}</span>
          <span v-if="shownQuest.time_bucket" class="tv-tag">{{ m.time[shownQuest.time_bucket] }}</span>
          <span v-if="(shownQuest.times_picked ?? 0) > 1" class="tv-muted">{{ m.pickedCount((shownQuest.times_picked ?? 1) - 1) }}</span>
        </p>
        <div class="tv-quest-buttons">
          <button ref="firstResult" type="button" class="tv-button" data-testid="tv-quest-accept" @click="run(() => quest.accept(shownQuest!))">{{ m.accept }}</button>
          <button type="button" class="tv-button" data-testid="tv-quest-reroll" @click="run(quest.pick)">{{ m.reroll }}</button>
          <button type="button" class="tv-button" data-testid="tv-quest-done" @click="run(() => quest.finish(shownQuest!))">{{ m.done }}</button>
        </div>
      </div>
      <!-- SPEC §5 Random Quest: a task can come up too; it has its own buttons and leaves quest numbers alone. -->
      <div v-else-if="shownTask" class="tv-quest-result" aria-live="polite" data-testid="tv-quest-task">
        <p class="tv-muted">{{ m.taskResultHeading }}</p>
        <h3 class="tv-quest-title" data-testid="tv-quest-title">{{ shownTask.title }}</h3>
        <RichNotes class="tv-quest-notes" :value="shownTask.notes" />
        <div class="tv-quest-buttons">
          <button ref="firstResult" type="button" class="tv-button" data-testid="tv-quest-task-done" @click="run(() => quest.taskDone(shownTask!))">{{ m.taskDone }}</button>
          <button v-if="!shownTask.due_date" type="button" class="tv-button" data-testid="tv-quest-today" @click="run(() => quest.doToday(shownTask!))">{{ m.doToday }}</button>
          <button type="button" class="tv-button" data-testid="tv-quest-reroll" @click="run(quest.pick)">{{ m.reroll }}</button>
        </div>
      </div>
      <p v-if="quest.notice.value" class="tv-note tv-quest-notice" role="status" data-testid="tv-quest-notice">{{ quest.notice.value }}</p>
      <!-- SPEC §2 Undo in place: Mark done leaves its Undo where the quest was shown. -->
      <p v-for="l in quest.lines.value" :key="l.key" class="tv-undo-line" data-testid="tv-quest-undo-line">
        <span :id="`undo-${l.key}`" class="tv-muted">{{ l.message }}</span>
        <button type="button" class="tv-button" :aria-describedby="`undo-${l.key}`" :data-undo="l.key" data-testid="tv-quest-undo" @click="run(() => quest.undoLine(l))">
          {{ undo }}
        </button>
      </p>
    </section>
  </div>
</template>

<script setup lang="ts">
// SPEC §9 TV app, Go on a Quest: the §5 Random Quest picker in a popup, until I dismiss it (✕, Back, or the dimmed
// background). The filters, Pick, and the picked quest or task with its own buttons; Mark done leaves an Undo line.
// After each press focus goes where the remote needs it next: the picked thing's first button, the new Undo, or Pick.
import { computed, nextTick, onMounted, ref } from 'vue'
import RichNotes from '@/components/RichNotes.vue'
import { ENERGY_LEVELS, TIME_BUCKETS } from '@/quests/picker'
import type { TvQuest } from '@/tv/screen/quest'
import type { EnergyLevel, TimeBucket } from '@/sync/types'
import { messages } from '@/messages'

const props = defineProps<{ quest: TvQuest }>()
const emit = defineEmits<{ close: [] }>()
const m = messages.quests
const tv = messages.tv
const close = messages.windows.close
const undo = messages.undo.undo
const shownQuest = computed(() => (props.quest.shown.value?.kind === 'quest' ? props.quest.shown.value.quest : null))
const shownTask = computed(() => (props.quest.shown.value?.kind === 'task' ? props.quest.shown.value.task : null))

const filters = computed(() => [
  {
    label: m.energyLabel,
    value: () => props.quest.energy.value,
    set: (v: string | null) => props.quest.setEnergy(v as EnergyLevel | null),
    options: ENERGY_LEVELS.map((e) => ({ value: e, label: m.energy[e] })),
  },
  {
    label: m.timeLabel,
    value: () => props.quest.time.value,
    set: (v: string | null) => props.quest.setTime(v as TimeBucket | null),
    options: TIME_BUCKETS.map((t) => ({ value: t, label: m.time[t] })),
  },
])

const box = ref<HTMLElement | null>(null)
const pickButton = ref<HTMLButtonElement | null>(null)
const firstResult = ref<HTMLButtonElement | null>(null)

async function run(press: () => Promise<void>) {
  const lines = props.quest.lines.value.length
  await press()
  if (props.quest.trouble.value) return
  await nextTick()
  const added = props.quest.lines.value.length > lines ? props.quest.lines.value[props.quest.lines.value.length - 1] : null
  const undoButton = added ? (box.value?.querySelector(`[data-undo="${added.key}"]`) as HTMLElement | null) : null
  ;(undoButton ?? firstResult.value ?? pickButton.value)?.focus()
}

// A click that starts inside (selecting text) doesn't close it (SPEC §2 Windows).
const downOutside = ref(false)
function clickOutside() {
  if (downOutside.value) emit('close')
  downOutside.value = false
}

onMounted(() => (firstResult.value ?? pickButton.value)?.focus())
</script>
