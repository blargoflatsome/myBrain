<template>
  <section class="flex flex-col gap-4 rounded-xl border border-line p-4" data-testid="availability">
    <div>
      <h3 class="font-semibold">{{ m.heading }}</h3>
      <p class="text-xs text-muted">{{ m.intro }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">{{ m.weekly }}</h3>
      <p v-if="!rulesShown.length" class="text-sm text-muted">{{ m.noWeekly }}</p>
      <ul class="flex flex-col gap-1">
        <template v-for="{ key, row: r, line } in rulesShown" :key="key">
          <UndoLine v-if="line" :line="line" in-box class="!pl-0" @undo="(el) => undoable.run(line, el)" />
          <li v-else-if="r" class="flex items-center justify-between gap-2 text-sm" data-testid="availability-rule">
            <span>{{ ruleLabel(r) }}</span>
            <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(`${dayNames[r.weekday]} ${t(r.start_time)}`)" @click="removeRule(r)">✕</button>
          </li>
        </template>
      </ul>
      <form v-if="addingRule" class="grid grid-cols-3 gap-2" @submit.prevent="addRule">
        <label class="flex flex-col gap-1 text-xs text-muted">{{ m.day }}
          <select v-model.number="ruleDay" :class="fieldCompact">
            <option v-for="(d, i) in dayNames" :key="i" :value="i">{{ d }}</option>
          </select>
        </label>
        <TimeInput v-model="ruleFrom" :label="m.from" label-class="text-xs text-muted" :input-class="fieldCompact" />
        <TimeInput v-model="ruleUntil" :label="m.until" label-class="text-xs text-muted" :input-class="fieldCompact" />
        <p v-if="ruleError" class="col-span-3 text-sm text-danger" role="alert">{{ ruleError }}</p>
        <button type="submit" class="col-span-3" :class="primaryButtonSmall">{{ m.add }}</button>
      </form>
      <div v-else-if="!addingWork" class="flex flex-wrap gap-2">
        <button type="button" class="min-h-11 rounded-xl border border-dashed border-line px-3 text-sm" @click="addingRule = true">{{ m.addWeekly }}</button>
        <button type="button" class="min-h-11 rounded-xl border border-dashed border-line px-3 text-sm" data-testid="add-work-hours" @click="addingWork = true">{{ m.workHours }}</button>
      </div>
      <!-- SPEC §10 Scheduler: Work hours adds the same times on several days at once. -->
      <form v-if="addingWork" class="flex flex-col gap-2" data-testid="work-hours" @submit.prevent="addWorkHours">
        <p class="text-xs text-muted">{{ m.workHoursHint }}</p>
        <span id="work-days" class="text-xs text-muted">{{ m.days }}</span>
        <WeekdayPicker v-model="workDays" labelledby="work-days" />
        <div class="grid grid-cols-2 gap-2">
          <TimeInput v-model="workFrom" :label="m.from" label-class="text-xs text-muted" :input-class="fieldCompact" />
          <TimeInput v-model="workUntil" :label="m.until" label-class="text-xs text-muted" :input-class="fieldCompact" />
        </div>
        <p v-if="workError" class="text-sm text-danger" role="alert">{{ workError }}</p>
        <button type="submit" :class="primaryButtonSmall">{{ m.addWorkHours }}</button>
      </form>
    </div>

    <div class="flex flex-col gap-2 border-t border-line pt-4">
      <h3 class="text-sm font-semibold">{{ m.exceptions }}</h3>
      <p v-if="!daysShown.length" class="text-sm text-muted">{{ m.noExceptions }}</p>
      <ul class="flex flex-col gap-1">
        <template v-for="{ key, row: x, line } in daysShown" :key="key">
          <UndoLine v-if="line" :line="line" in-box class="!pl-0" @undo="(el) => undoable.run(line, el)" />
          <li v-else-if="x" class="flex items-center justify-between gap-2 text-sm" data-testid="availability-exception">
            <span>
              {{ dayLabel(x.date) }} · {{ x.start_time ? `${t(x.start_time)} – ${t(x.end_time)}` : m.allDay }} ·
              <span :class="x.kind === 'available' ? 'text-accent' : 'text-muted'">{{ m.kinds[x.kind] }}</span>
              <span v-if="x.note" class="text-muted"> · {{ x.note }}</span>
            </span>
            <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(dayLabel(x.date))" @click="removeDay(x)">✕</button>
          </li>
        </template>
      </ul>
      <form v-if="addingException" class="flex flex-col gap-2" @submit.prevent="addException">
        <div class="grid grid-cols-2 gap-2">
          <DateInput v-model="exDate" :label="m.date" label-class="text-xs text-muted" required :input-class="fieldCompact" />
          <label class="flex flex-col gap-1 text-xs text-muted">{{ m.kind }}
            <select v-model="exKind" :class="fieldCompact">
              <option value="unavailable">{{ m.kinds.unavailable }}</option>
              <option value="available">{{ m.kinds.available }}</option>
            </select>
          </label>
        </div>
        <label class="flex items-center gap-2 text-sm"><input v-model="exAllDay" type="checkbox" class="size-5 accent-[var(--accent)]">{{ m.allDay }}</label>
        <div v-if="!exAllDay" class="grid grid-cols-2 gap-2">
          <TimeInput v-model="exFrom" :label="m.from" label-class="text-xs text-muted" :input-class="fieldCompact" />
          <TimeInput v-model="exUntil" :label="m.until" label-class="text-xs text-muted" :input-class="fieldCompact" />
        </div>
        <label class="flex flex-col gap-1 text-xs text-muted">{{ m.note }}<input v-model="exNote" :class="fieldCompact"></label>
        <p v-if="exError" class="text-sm text-danger" role="alert">{{ exError }}</p>
        <button type="submit" :class="primaryButtonSmall">{{ m.add }}</button>
      </form>
      <button v-else type="button" class="min-h-11 self-start rounded-xl border border-dashed border-line px-3 text-sm" @click="addingException = true">{{ m.addException }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Availability schedule: weekly times I'm never free, and one-off days (unavailable, or available after all).
import { useRows } from '@/sync/useRows'
import TimeInput from '@/components/TimeInput.vue'
import DateInput from '@/components/DateInput.vue'
import WeekdayPicker from '@/components/WeekdayPicker.vue'
import { computed, ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import UndoLine from '@/components/UndoLine.vue'
import { useUndoInPlace } from '@/composables/useUndoInPlace'
import type { AvailabilityExceptionRow, AvailabilityRuleRow } from '@/sync/types'
import { todayIn, deviceTimeZone } from '@/tasks/days'
import { formatTime } from '@/time/parse'
import { messages } from '@/messages'
import { fieldCompact, primaryButtonSmall } from '@/ui/styles'
import { dayLabel } from '@/ui/dates'

const brain = useBrainStore()
const m = messages.availability
const dayNames = messages.habits.weekdayNames

const rules = useRows('availability_rules')
const exceptions = useRows('availability_exceptions')
const today = todayIn(deviceTimeZone())
const sortedRules = computed(() => [...rules.value].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)))
const upcoming = computed(() => exceptions.value.filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date)))

const t = (time: string | null) => (time ? formatTime(time, true) : '')
const ruleLabel = (r: AvailabilityRuleRow) => `${dayNames[r.weekday]} · ${t(r.start_time)} – ${t(r.end_time)}`

// Removing one goes straight away, with Undo in place (SPEC §2).
const undoable = useUndoInPlace()
const rulesShown = computed(() => undoable.placed(sortedRules.value, 'rules'))
const daysShown = computed(() => undoable.placed(upcoming.value, 'days'))
async function removeRule(r: AvailabilityRuleRow) {
  const place = { row: { id: r.id, in: sortedRules.value }, list: 'rules' }
  undoable.offer(messages.undo.removed(ruleLabel(r)), await brain.removeAvailability('availability_rules', r.id), place)
}
async function removeDay(x: AvailabilityExceptionRow) {
  const place = { row: { id: x.id, in: upcoming.value }, list: 'days' }
  undoable.offer(messages.undo.removed(dayLabel(x.date)), await brain.removeAvailability('availability_exceptions', x.id), place)
}

// ---------- Weekly ----------
const addingRule = ref(false)
const ruleDay = ref(1)
const ruleFrom = ref('09:00')
const ruleUntil = ref('17:00')
const ruleError = ref('')
async function addRule() {
  if (!(await brain.addAvailability([ruleDay.value], ruleFrom.value, ruleUntil.value))) return (ruleError.value = m.timeError)
  ruleError.value = ''
  addingRule.value = false
}

// ---------- Work hours: the same times on several weekdays (Mon–Fri, 9 to 5 to start) ----------
const addingWork = ref(false)
const workDays = ref([1, 2, 3, 4, 5])
const workFrom = ref('09:00')
const workUntil = ref('17:00')
const workError = ref('')
async function addWorkHours() {
  if (!(await brain.addAvailability(workDays.value, workFrom.value, workUntil.value))) return (workError.value = m.timeError)
  workError.value = ''
  addingWork.value = false
}
// ---------- One-off days ----------
const addingException = ref(false)
const exDate = ref(today)
const exAllDay = ref(true)
const exFrom = ref('09:00')
const exUntil = ref('17:00')
const exKind = ref<'unavailable' | 'available'>('unavailable')
const exNote = ref('')
const exError = ref('')
async function addException() {
  const added = await brain.addAvailabilityDay({
    date: exDate.value,
    from: exAllDay.value ? null : exFrom.value,
    until: exAllDay.value ? null : exUntil.value,
    kind: exKind.value,
    note: exNote.value,
  })
  if (!added) return (exError.value = m.timeError)
  exError.value = ''
  exNote.value = ''
  addingException.value = false
}
</script>
