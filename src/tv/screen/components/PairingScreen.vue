<template>
  <main class="tv-pairing" data-testid="tv-pairing">
    <h1 class="tv-heading">{{ m.pairHeading }}</h1>
    <p v-if="unpaired" class="tv-note" data-testid="tv-unpaired">{{ m.unpaired }}</p>
    <p class="tv-lead">{{ m.pairSteps }}</p>
    <p v-if="code" class="tv-code">
      <span aria-hidden="true" data-testid="tv-code">{{ spacedCode(code.code) }}</span>
      <!-- Read letter by letter: as shown, a screen reader says it as two made-up words. -->
      <span class="tv-sr-only">{{ m.codeLabel }}: {{ code.code.split('').join(' ') }}</span>
    </p>
    <p v-if="code" class="tv-muted">{{ m.pairAddress(address) }}</p>
    <p v-if="code" class="tv-muted">{{ m.newCodeHint }}</p>
    <p v-if="trouble" class="tv-note" role="status">{{ m.offline }}</p>
  </main>
</template>

<script setup lang="ts">
// SPEC §9 Signing in by pairing: the TV shows a code to approve on my phone, checks every few seconds, and gets a new
// code by itself when one runs out. An unpaired TV also keeps trying its old key, so Undo on the phone brings it back.
import { onScopeDispose, onMounted, ref } from 'vue'
import { checkKey, pollPairing, POLL_MS, RECHECK_MS, saveKey, savedKey, spacedCode, startPairing, type TvCode } from '@/tv/screen/pairing'
import { messages } from '@/messages'

const props = defineProps<{ unpaired?: boolean }>()
const emit = defineEmits<{ paired: [] }>()
const m = messages.tv
const code = ref<TvCode | null>(null)
const trouble = ref(false)
// Shown for typing by hand, so without https://.
const address = `${window.location.host}/pair`
const RETRY_MS = 10_000
let pollTimer: ReturnType<typeof setTimeout> | undefined
let recheckTimer: ReturnType<typeof setInterval> | undefined
let stopped = false

async function newCode() {
  try {
    const next = await startPairing()
    // Paired (or closed) while asking: nothing more to show or check.
    if (stopped) return
    code.value = next
    trouble.value = false
    schedule(POLL_MS)
  } catch {
    if (stopped) return
    trouble.value = true
    pollTimer = setTimeout(() => void newCode(), RETRY_MS)
  }
}

function schedule(ms: number) {
  if (!stopped) pollTimer = setTimeout(() => void poll(), ms)
}

async function poll() {
  const shown = code.value
  if (!shown) return
  try {
    const answer = await pollPairing(shown.secret)
    trouble.value = false
    if (answer.status === 'paired') return done(answer.device_key)
    if (answer.status === 'expired' || Date.parse(shown.expires_at) <= Date.now()) return void newCode()
    schedule(POLL_MS)
  } catch {
    trouble.value = true
    schedule(RETRY_MS)
  }
}

function done(key: string) {
  stop()
  saveKey(key)
  emit('paired')
}

function stop() {
  stopped = true
  clearTimeout(pollTimer)
  clearInterval(recheckTimer)
}

onMounted(() => {
  void newCode()
  const old = props.unpaired ? savedKey() : null
  if (old) {
    recheckTimer = setInterval(() => {
      void checkKey(old).then((state) => {
        if (state === 'paired' && !stopped) done(old)
      })
    }, RECHECK_MS)
  }
})
onScopeDispose(stop)
</script>
