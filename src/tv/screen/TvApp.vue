<template>
  <IdleScreen v-if="idle" :now="now" />
  <p v-else-if="state === 'starting'" class="tv-status" role="status">{{ m.connecting }}</p>
  <PairingScreen v-else-if="state === 'pairing'" :unpaired="wasUnpaired" @paired="onPaired" />
  <DashboardScreen v-else :now="now" />
</template>

<script setup lang="ts">
// SPEC §9 TV app: the page the TV launcher opens. Unpaired, it shows the pairing screen; paired, the dashboard. After
// 15 minutes with no button pressed it dims to the night screen, and the press that wakes it does nothing else.
import { computed, onMounted, onScopeDispose, provide, ref } from 'vue'
import IdleScreen from '@/tv/screen/components/IdleScreen.vue'
import PairingScreen from '@/tv/screen/components/PairingScreen.vue'
import DashboardScreen from '@/tv/screen/components/DashboardScreen.vue'
import { useNow } from '@/composables/useNow'
import { IDLE_HOLD, isIdle } from '@/tv/screen/idle'
import { checkKey, RECHECK_MS, savedKey } from '@/tv/screen/pairing'
import { messages } from '@/messages'

const m = messages.tv
const state = ref<'starting' | 'pairing' | 'dashboard'>('starting')
const wasUnpaired = ref(false)
const now = useNow(1_000)
const lastPressAt = ref(Date.now())
const held = ref(false)
const heldEndedAt = ref<number | null>(null)
const idle = computed(() => state.value === 'dashboard' && isIdle(lastPressAt.value, now.value.getTime(), held.value, heldEndedAt.value))

// A routine or the Focus timer holds the night screen off while it's open.
provide(IDLE_HOLD, (on: boolean) => {
  held.value = on
  if (!on) heldEndedAt.value = Date.now()
})

function onKey(e: KeyboardEvent) {
  const wasIdle = idle.value
  lastPressAt.value = Date.now()
  now.value = new Date()
  if (wasIdle) {
    // Waking takes the whole press (SPEC §9 Idle screen).
    e.preventDefault()
    e.stopImmediatePropagation()
  }
}

async function start() {
  const key = savedKey()
  if (!key) return (state.value = 'pairing')
  const answer = await checkKey(key)
  wasUnpaired.value = answer === 'unpaired'
  // Out of reach is not unpaired: show what it can and keep checking.
  state.value = answer === 'unpaired' ? 'pairing' : 'dashboard'
}

function onPaired() {
  wasUnpaired.value = false
  lastPressAt.value = Date.now()
  state.value = 'dashboard'
}

// While the dashboard shows, notice an Unpair from my phone.
const recheck = setInterval(() => {
  const key = savedKey()
  if (state.value !== 'dashboard' || !key) return
  void checkKey(key).then((answer) => {
    if (answer !== 'unpaired' || state.value !== 'dashboard') return
    wasUnpaired.value = true
    state.value = 'pairing'
  })
}, RECHECK_MS)

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  void start()
})
onScopeDispose(() => {
  window.removeEventListener('keydown', onKey, true)
  clearInterval(recheck)
})
</script>
