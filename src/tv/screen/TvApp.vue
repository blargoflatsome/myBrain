<template>
  <IdleScreen v-if="idle" :now="now" :time-zone="timeZone" :next="upNextNow" :loaded="!!snapshot" />
  <p v-else-if="state === 'starting'" class="tv-status" role="status">{{ m.connecting }}</p>
  <PairingScreen v-else-if="state === 'pairing'" :unpaired="wasUnpaired" @paired="onPaired" />
  <template v-else>
    <RoutineRunScreen
      v-if="openRoutine && snapshot"
      :routine="openRoutine"
      :facts="routineFacts!"
      :today="today"
      :time-zone="timeZone"
      :device-key="savedKey"
      :refresh="refresh"
      @close="closeRoutine"
    />
    <!-- Hidden, not removed, under a routine: Back finds the strip on the page it was on. -->
    <DashboardScreen
      v-show="!(openRoutine && snapshot)"
      :now="now"
      :time-zone="timeZone"
      :today="today"
      :month="month"
      :items="items"
      :day-rows="dayRows"
      :routine-rows="routineRows"
      :trouble="trouble"
      @move="moveMonth"
      @open-routine="(id) => (openRoutineId = id)"
    />
  </template>
</template>

<script setup lang="ts">
// SPEC §9 TV app: the page the TV launcher opens. Unpaired, it shows the pairing screen; paired, the dashboard. After
// 15 minutes with no button pressed it dims to the night screen, and the press that wakes it does nothing else. What
// the dashboard shows comes from tv_snapshot, asked for every 30 seconds, on waking and when the month changes.
import { computed, nextTick, onMounted, onScopeDispose, provide, ref, watch } from 'vue'
import IdleScreen from '@/tv/screen/components/IdleScreen.vue'
import PairingScreen from '@/tv/screen/components/PairingScreen.vue'
import DashboardScreen from '@/tv/screen/components/DashboardScreen.vue'
import RoutineRunScreen from '@/tv/screen/components/RoutineRunScreen.vue'
import { routineToday } from '@/routines/listing'
import type { TvRoutineFacts } from '@/tv/screen/routines'
import { useNow } from '@/composables/useNow'
import { IDLE_HOLD, isIdle } from '@/tv/screen/idle'
import { checkKey, savedKey } from '@/tv/screen/pairing'
import { REFRESH_MS, snapshotLoader, type Snapshot } from '@/tv/screen/snapshot'
import { addMonths, monthItems, monthOf, monthRange, yourDay } from '@/tv/screen/dashboard'
import { upNextFrom } from '@/dashboard/upNext'
import { buttonOf } from '@/tv/screen/remote'
import { nextFocus } from '@/tv/screen/spatial'
import { isUnpaired } from '@/tv/screen/tvServer'
import { deviceTimeZone, todayIn } from '@/time/days'
import { messages } from '@/messages'

const m = messages.tv
const state = ref<'starting' | 'pairing' | 'dashboard'>('starting')
const wasUnpaired = ref(false)
const now = useNow(1_000)
// Followed each tick, so the TV keeps up if its zone changes.
const timeZone = computed(() => {
  void now.value
  return deviceTimeZone()
})
const today = computed(() => todayIn(timeZone.value, now.value))
const lastPressAt = ref(Date.now())
const held = ref(false)
const heldEndedAt = ref<number | null>(null)
const idle = computed(() => state.value === 'dashboard' && isIdle(lastPressAt.value, now.value.getTime(), held.value, heldEndedAt.value))

// A routine or the Focus timer holds the night screen off while it's open.
provide(IDLE_HOLD, (on: boolean) => {
  held.value = on
  if (!on) heldEndedAt.value = Date.now()
})

// What the dashboard and the night screen show.
const loader = snapshotLoader(savedKey)
const snapshot = ref<Snapshot | null>(null)
const trouble = ref(false)
const month = ref(monthOf(today.value))
const items = computed(() => {
  if (!snapshot.value) return {}
  const { from, to } = monthRange(month.value)
  return monthItems(snapshot.value.facts, from, to)
})
const dayRows = computed(() => (snapshot.value ? yourDay(snapshot.value.facts, today.value, timeZone.value) : []))
// Routines (SPEC §9 Routines): the strip's rows, and the one open full screen.
const routineFacts = computed<TvRoutineFacts | null>(() => {
  const s = snapshot.value
  if (!s) return null
  const f = s.facts
  return { me: f.me ?? '', steps: s.routineSteps, runs: f.routineRuns, logs: s.stepLogs, habits: f.habits, habitLogs: f.habitLogs, habitPauses: f.habitPauses ?? [] }
})
const routineRows = computed(() => {
  const f = routineFacts.value
  return f && snapshot.value ? snapshot.value.facts.routines.map((r) => routineToday(r, f, today.value)) : []
})
const openRoutineId = ref<string | null>(null)
// A routine deleted on my phone while open here closes at the next refresh.
const openRoutine = computed(() => (openRoutineId.value && snapshot.value?.facts.routines.find((r) => r.id === openRoutineId.value)) || null)
function closeRoutine() {
  const id = openRoutineId.value
  openRoutineId.value = null
  void nextTick(() => (document.querySelector(`[data-routine="${id}"]`) as HTMLElement | null ?? document.querySelector('button') as HTMLElement | null)?.focus())
}

const upNextNow = computed(() => {
  const s = snapshot.value
  return s ? (upNextFrom(s.facts, now.value, timeZone.value, s.journalTime)[0] ?? null) : null
})

let loading = 0
async function refresh() {
  if (state.value !== 'dashboard') return
  const asked = ++loading
  const { from, to } = monthRange(month.value)
  try {
    const answer = await loader.load(from, to, today.value)
    // A slower, older answer (another month) never replaces a newer one.
    if (asked !== loading) return
    snapshot.value = answer
    trouble.value = false
  } catch (err) {
    if (asked !== loading) return
    if (isUnpaired(err)) return toPairing()
    // Out of reach: keep showing what it had and try again on the next refresh.
    trouble.value = true
  }
}

function moveMonth(by: number) {
  month.value = by === 0 ? monthOf(today.value) : addMonths(month.value, by)
}
watch(month, () => void refresh())
watch(today, () => void refresh())
watch(idle, (dimmed) => {
  // The morning starts on this month, even when a new month began overnight; waking shows what's current.
  month.value = monthOf(today.value)
  if (!dimmed) {
    void refresh()
    focusFirst()
  }
})

function toPairing() {
  openRoutineId.value = null
  wasUnpaired.value = true
  state.value = 'pairing'
  snapshot.value = null
  loader.reset()
}

// The remote has arrows, not Tab: an arrow moves focus to the nearest control that way (Remote control).
function moveFocus(arrow: 'up' | 'down' | 'left' | 'right') {
  // Only what shows: the dashboard stays on the page, hidden, under a routine.
  const controls = (Array.prototype.slice.call(document.querySelectorAll('button:not([disabled]), a[href]')) as HTMLElement[]).filter((c) => c.offsetParent !== null)
  if (!controls.length) return
  const at = document.activeElement as HTMLElement | null
  const from = at ? controls.indexOf(at) : -1
  if (from < 0) return controls[0]!.focus()
  const boxes = controls.map((c) => c.getBoundingClientRect())
  const to = nextFocus(boxes[from]!, boxes, arrow)
  if (to >= 0) controls[to]!.focus()
}

function onKey(e: KeyboardEvent) {
  const wasIdle = idle.value
  lastPressAt.value = Date.now()
  now.value = new Date()
  if (wasIdle) {
    // Waking takes the whole press (SPEC §9 Idle screen).
    e.preventDefault()
    e.stopImmediatePropagation()
    return
  }
  const button = buttonOf(e)
  if (button === 'back' && openRoutineId.value) {
    e.preventDefault()
    return closeRoutine()
  }
  if (button === 'up' || button === 'down' || button === 'left' || button === 'right') {
    e.preventDefault()
    moveFocus(button)
  }
}

async function start() {
  const key = savedKey()
  if (!key) return (state.value = 'pairing')
  const answer = await checkKey(key)
  wasUnpaired.value = answer === 'unpaired'
  // Out of reach is not unpaired: show what it can and keep checking.
  state.value = answer === 'unpaired' ? 'pairing' : 'dashboard'
  void refresh()
}

function onPaired() {
  wasUnpaired.value = false
  lastPressAt.value = Date.now()
  loader.reset()
  state.value = 'dashboard'
  month.value = monthOf(today.value)
  void refresh()
}

// Focus starts on the first control, so the remote has somewhere to begin.
function focusFirst() {
  void nextTick(() => (document.querySelector('button') as HTMLElement | null)?.focus())
}
watch(state, (s) => {
  if (s === 'dashboard') focusFirst()
})

// While the dashboard shows, the refresh also notices an Unpair from my phone (the snapshot refuses the key).
const refresher = setInterval(() => void refresh(), REFRESH_MS)

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  void start()
})
onScopeDispose(() => {
  window.removeEventListener('keydown', onKey, true)
  clearInterval(refresher)
})
</script>
