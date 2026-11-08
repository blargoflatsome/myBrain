<template>
  <section class="flex flex-col gap-4 rounded-xl border border-line p-4" data-testid="availability">
    <div>
      <h3 class="font-semibold">{{ m.heading }}</h3>
      <p class="text-xs text-muted">{{ m.intro }}</p>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">{{ m.weekly }}</h3>
      <p v-if="!sortedRules.length" class="text-sm text-muted">{{ m.noWeekly }}</p>
      <ul class="flex flex-col gap-1">
        <li v-for="r in sortedRules" :key="r.id" class="flex items-center justify-between gap-2 text-sm" data-testid="availability-rule">
          <span>{{ dayNames[r.weekday] }} · {{ t(r.start_time) }} – {{ t(r.end_time) }}</span>
          <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(`${dayNames[r.weekday]} ${t(r.start_time)}`)" @click="brain.deleteAvailabilityRule(r.id)">✕</button>
        </li>
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
        <button type="submit" class="col-span-3 min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.add }}</button>
      </form>
      <button v-else type="button" class="min-h-11 self-start rounded-xl border border-dashed border-line px-3 text-sm" @click="addingRule = true">{{ m.addWeekly }}</button>
    </div>

    <div class="flex flex-col gap-2 border-t border-line pt-4">
      <h3 class="text-sm font-semibold">{{ m.exceptions }}</h3>
      <p v-if="!upcoming.length" class="text-sm text-muted">{{ m.noExceptions }}</p>
      <ul class="flex flex-col gap-1">
        <li v-for="x in upcoming" :key="x.id" class="flex items-center justify-between gap-2 text-sm" data-testid="availability-exception">
          <span>
            {{ shortDay(x.date) }} · {{ x.start_time ? `${t(x.start_time)} – ${t(x.end_time)}` : m.allDay }} ·
            <span :class="x.kind === 'available' ? 'text-accent' : 'text-muted'">{{ m.kinds[x.kind] }}</span>
            <span v-if="x.note" class="text-muted"> · {{ x.note }}</span>
          </span>
          <button type="button" class="size-9 rounded-lg text-muted" :aria-label="m.remove(shortDay(x.date))" @click="brain.deleteAvailabilityException(x.id)">✕</button>
        </li>
      </ul>
      <form v-if="addingException" class="flex flex-col gap-2" @submit.prevent="addException">
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1 text-xs text-muted">{{ m.date }}<input v-model="exDate" type="date" :class="fieldCompact"></label>
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
        <button type="submit" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink">{{ m.add }}</button>
      </form>
      <button v-else type="button" class="min-h-11 self-start rounded-xl border border-dashed border-line px-3 text-sm" @click="addingException = true">{{ m.addException }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
// SPEC §5 Availability schedule: weekly times I'm never free, and one-off days (unavailable, or available after all).
import TimeInput from '@/components/TimeInput.vue'
import { computed, ref } from 'vue'
import { useBrainStore } from '@/stores/brain'
import { useAuthStore } from '@/stores/auth'
import { useLiveQuery } from '@/composables/useLiveQuery'
import { todayIn, deviceTimeZone } from '@/tasks/days'
import { messages } from '@/messages'
import type { AvailabilityExceptionRow, AvailabilityRuleRow } from '@/sync/types'
import { fieldCompact } from '@/ui/styles'
import { shortDay } from '@/ui/dates'
import { live } from '@/sync/live'

const brain = useBrainStore()
const auth = useAuthStore()
const m = messages.availability
const dayNames = messages.habits.weekdayNames

const rules = useLiveQuery<AvailabilityRuleRow[]>(
  async () => (brain.db ? live(await brain.db.availability_rules.toArray()) : []),
  [],
  [() => brain.db],
)
const exceptions = useLiveQuery<AvailabilityExceptionRow[]>(
  async () => (brain.db ? live(await brain.db.availability_exceptions.toArray()) : []),
  [],
  [() => brain.db],
)
const today = todayIn(deviceTimeZone())
const sortedRules = computed(() => [...rules.value].sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time)))
const upcoming = computed(() => exceptions.value.filter((x) => x.date >= today).sort((a, b) => a.date.localeCompare(b.date)))

const t = (time: string | null) => {
  if (!time) return ''
  const [h, mm] = time.split(':').map(Number)
  return `${h! % 12 || 12}:${String(mm).padStart(2, '0')} ${h! < 12 ? 'am' : 'pm'}`
}

// ---------- Weekly ----------
const addingRule = ref(false)
const ruleDay = ref(1)
const ruleFrom = ref('09:00')
const ruleUntil = ref('17:00')
const ruleError = ref('')
async function addRule() {
  if (ruleUntil.value <= ruleFrom.value) return (ruleError.value = m.timeError)
  ruleError.value = ''
  await brain.saveAvailabilityRule({ id: crypto.randomUUID(), user_id: auth.user?.id, weekday: ruleDay.value, start_time: ruleFrom.value, end_time: ruleUntil.value, deleted_at: null })
  addingRule.value = false
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
  if (!exAllDay.value && exUntil.value <= exFrom.value) return (exError.value = m.timeError)
  exError.value = ''
  await brain.saveAvailabilityException({
    id: crypto.randomUUID(),
    user_id: auth.user?.id,
    date: exDate.value,
    start_time: exAllDay.value ? null : exFrom.value,
    end_time: exAllDay.value ? null : exUntil.value,
    kind: exKind.value,
    note: exNote.value.trim() || null,
    deleted_at: null,
  })
  exNote.value = ''
  addingException.value = false
}
</script>
