<template>
  <IdleScreen v-if="idle" :now="now" :time-zone="timeZone" :next="upNextNow" :loaded="!!snapshot" />
  <p v-else-if="state === 'starting'" class="tv-status" role="status">{{ m.connecting }}</p>
  <PairingScreen v-else-if="state === 'pairing'" :unpaired="wasUnpaired" @paired="onPaired" />
  <template v-else>
    <FocusScreen v-if="focus.showing.value" :focus="focus" />
    <RoutineRunScreen
      v-else-if="openRoutine && snapshot"
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
      v-show="!focus.showing.value && !(openRoutine && snapshot)"
      :now="now"
      :time-zone="timeZone"
      :today="today"
      :month="month"
      :items="items"
      :day="day"
      :routine-rows="routineRows"
      :trouble="trouble"
      :focus-pill="focusPill"
      @move="moveMonth"
      @open-routine="(id) => (openRoutineId = id)"
      @quest="quest.show()"
      @focus="focus.open()"
    />
    <QuestPopup v-if="quest.open.value && !openRoutine && !focus.showing.value" :quest="quest" @close="closeQuest" />
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
import QuestPopup from '@/tv/screen/components/QuestPopup.vue'
import FocusScreen from '@/tv/screen/components/FocusScreen.vue'
import { useTvFocus } from '@/tv/screen/focus'
import { useTvQuest } from '@/tv/screen/quest'
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
// 15 minutes with no press (SPEC §9 Idle screen). With a Focus timer minimized, it opens full screen instead of the
// night screen (2026-11-26, user); full screen, it holds the night screen off.
const dimDue = computed(() => state.value === 'dashboard' && isIdle(lastPressAt.value, now.value.getTime(), held.value, heldEndedAt.value))
const idle = computed(() => dimDue.value && !focus.state.value)

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
const day = computed(() => {
  const s = snapshot.value
  if (!s) return { rows: [], allDone: false }
  const f = s.facts
  return yourDay({ ...f, habitPauses: f.habitPauses ?? [] }, today.value, now.value, timeZone.value)
})
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

// Go on a Quest (SPEC §9): kept here, so the popup is still open when the TV wakes from the night screen.
const quest = useTvQuest(savedKey, () => today.value, () => timeZone.value, () => toPairing())
function closeQuest() {
  quest.close()
  void nextTick(() => (document.querySelector('[data-testid="tv-quest-open"]') as HTMLElement | null)?.focus())
}

// The Focus timer (SPEC §9): on the TV only; minimized, the strip's button shows it.
const focus = useTvFocus(savedKey)
const focusPill = computed(() =>
  focus.state.value && focus.minimized.value ? { phase: messages.focus.phaseShort[focus.state.value.phase], time: focus.time.value } : null,
)
watch(dimDue, (due) => {
  if (due && focus.state.value) focus.open()
})
// Minimized or stopped (✕), focus goes back to the strip's Focus timer button.
watch(
  () => focus.showing.value,
  (shows, was) => {
    if (was && !shows) void nextTick(() => (document.querySelector('[data-testid="tv-focus-open"]') as HTMLElement | null)?.focus())
  },
)

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
  quest.close()
  // Unpaired, the TV isn't mine any more: its timer stops (and leaves the room).
  focus.stop()
  wasUnpaired.value = true
  state.value = 'pairing'
  snapshot.value = null
  loader.reset()
}

/** The controls the remote can reach: only what shows, and only inside the popup while it's open (it traps focus). */
function reachable(): HTMLElement[] {
  // The dashboard stays on the page, hidden, under a routine.
  const scope = document.querySelector('[role="dialog"]') ?? document
  // A link in a quest's notes isn't reachable: opening it would take the TV out of My Brain (SPEC §9 Go on a Quest).
  return (Array.prototype.slice.call(scope.querySelectorAll('button:not([disabled]), a[href]')) as HTMLElement[]).filter(
    (c) => c.offsetParent !== null && !(c.tagName === 'A' && c.closest('.tv-quest-notes')),
  )
}

// The remote has arrows, not Tab: an arrow moves focus to the nearest control that way (Remote control).
function moveFocus(arrow: 'up' | 'down' | 'left' | 'right') {
  const controls = reachable()
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
  if (e.key === 'Tab' && quest.open.value) return trapTab(e)
  if (button === 'back' && focus.showing.value) {
    e.preventDefault()
    return focus.minimize()
  }
  if (button === 'back' && quest.open.value && !openRoutine.value) {
    e.preventDefault()
    return closeQuest()
  }
  if (button === 'back' && openRoutineId.value) {
    e.preventDefault()
    return closeRoutine()
  }
  if (button === 'up' || button === 'down' || button === 'left' || button === 'right') {
    e.preventDefault()
    moveFocus(button)
  }
}

// SPEC §2 Windows: Tab and Shift+Tab stay inside the popup (a keyboard trying the page; the remote has no Tab).
function trapTab(e: KeyboardEvent) {
  const controls = reachable()
  if (!controls.length) return
  const at = controls.indexOf(document.activeElement as HTMLElement)
  const to = at < 0 ? 0 : (at + (e.shiftKey ? -1 : 1) + controls.length) % controls.length
  e.preventDefault()
  controls[to]!.focus()
}

async function start() {
  const key = savedKey()
  if (!key) return (state.value = 'pairing')
  const answer = await checkKey(key)
  wasUnpaired.value = answer === 'unpaired'
  // Unpaired while it was off: a timer saved from before stops, as it does when unpaired while on.
  if (answer === 'unpaired') focus.stop()
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

// Focus starts on the first control (in the popup, if it's open), so the remote has somewhere to begin.
function focusFirst() {
  void nextTick(() => {
    const controls = reachable()
    // The popup, opening again on waking, already put focus where it belongs.
    if (controls.indexOf(document.activeElement as HTMLElement) < 0) controls[0]?.focus()
  })
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
