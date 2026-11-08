<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-10 pb-16">
    <p v-if="state === 'loading'" class="text-muted">{{ m.loading }}</p>
    <p v-else-if="state === 'invalid'" class="text-lg" role="alert" data-testid="guest-invalid">{{ m.invalid }}</p>
    <template v-else-if="data">
      <p class="text-sm font-semibold tracking-wide text-muted uppercase">{{ m.invitedBy(host) }}</p>
      <div class="flex flex-col gap-1">
        <h1 class="text-3xl font-bold" :class="data.cancelled ? 'line-through' : ''">{{ data.title }}</h1>
        <p class="text-lg" data-testid="guest-when">{{ whenText(data) }}</p>
        <p v-if="data.notes" class="whitespace-pre-wrap text-muted">{{ data.notes }}</p>
      </div>

      <p v-if="data.cancelled" class="rounded-xl bg-surface p-4 font-medium" role="status">{{ m.cancelled }}</p>
      <template v-else>
        <div class="flex flex-col gap-3 rounded-2xl border border-line p-4">
          <p class="font-medium">{{ data.guest_name ? m.hi(data.guest_name) : '' }} {{ m.going }}</p>
          <div class="flex gap-2" role="group" :aria-label="m.going">
            <button type="button" :class="btn(data.response === 'yes')" :aria-pressed="data.response === 'yes'" @click="answer('yes')">{{ m.yes }}</button>
            <button type="button" :class="btn(data.response === 'maybe')" :aria-pressed="data.response === 'maybe'" @click="answer('maybe')">{{ m.maybe }}</button>
            <button type="button" :class="btn(data.response === 'no')" :aria-pressed="data.response === 'no'" @click="answer('no')">{{ m.no }}</button>
          </div>
          <p v-if="thanks" class="text-sm" role="status">{{ thanks }}</p>
          <p v-else-if="data.response !== 'pending'" class="text-sm text-muted">{{ m.yourAnswer(m.answers[data.response]) }}</p>
        </div>
        <div v-if="offer && data.response !== 'pending' && data.response !== 'no'" class="flex flex-col gap-2 rounded-2xl border border-accent p-4" data-testid="guest-connect">
          <p>{{ m.connectOffer(host) }}</p>
          <button type="button" class="min-h-11 self-start rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="connectHost">{{ m.connect }}</button>
        </div>
        <p v-if="connectNote" class="text-sm" role="status" data-testid="guest-connect-sent">{{ connectNote }}</p>
        <button type="button" class="min-h-11 self-start rounded-xl border border-line px-4" @click="addToCalendar">📅 {{ m.addToCalendar }}</button>
      </template>

      <form class="flex flex-col gap-2" @submit.prevent="send">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.message(host) }}
          <textarea v-model="message" rows="3" maxlength="2000" class="rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink" :placeholder="m.messagePlaceholder" />
        </label>
        <button type="submit" class="min-h-11 self-start rounded-xl border border-line px-4">{{ m.send }}</button>
        <p v-if="messageSent" class="text-sm" role="status">{{ m.sent }}</p>
      </form>

      <p v-if="error" class="text-sm text-danger" role="alert">{{ error }}</p>

      <footer class="mt-auto flex flex-col gap-2 border-t border-line pt-4 text-sm text-muted">
        <p v-if="stopped" role="status">{{ m.stopped }}</p>
        <button v-else type="button" class="self-start underline" @click="stop">{{ m.stop }}</button>
        <p>{{ m.poweredBy }} · <RouterLink to="/privacy" class="underline">{{ m.privacy }}</RouterLink></p>
      </footer>
    </template>
  </main>
</template>

<script setup lang="ts">
// SPEC §5 Shared events: the public page a guest opens from their private link. No account needed: see the event,
// answer Yes / Maybe / No, message the host, add it to a calendar, or stop the emails.
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { guestConnectOffer, guestConnectWithHost } from '@/events/connections'
import { useAuthStore } from '@/stores/auth'
import { guestInvite, guestMessage, guestOptOut, guestRespond, whenText, type GuestInvite } from '@/events/sharing'
import { downloadIcs } from '@/events/ics'
import { messages } from '@/messages'

const route = useRoute()
const m = messages.guest
const invite = computed(() => String(route.params.invite))
const token = computed(() => String(route.params.token))

const state = ref<'loading' | 'ready' | 'invalid'>('loading')
const data = ref<GuestInvite | null>(null)
const thanks = ref('')
const error = ref('')
const message = ref('')
const messageSent = ref(false)
const stopped = ref(false)

onMounted(async () => {
  try {
    data.value = await guestInvite(invite.value, token.value)
    void checkOffer()
    state.value = data.value ? 'ready' : 'invalid'
  } catch {
    state.value = 'invalid'
  }
})

const host = computed(() => data.value?.host_name || 'Someone')
// An account holder invited as a guest can ask to connect with the host (SPEC §10 Connections); the host still accepts.
const auth = useAuthStore()
const offer = ref(false)
const connectNote = ref('')
async function checkOffer() {
  await auth.init()
  if (!auth.isSignedIn) return
  offer.value = !!(await guestConnectOffer(invite.value, token.value).catch(() => false))
}
async function connectHost() {
  await guestConnectWithHost(invite.value, token.value)
  offer.value = false
  connectNote.value = m.connectSent(host.value)
}
async function answer(a: 'yes' | 'maybe' | 'no') {
  error.value = ''
  try {
    await guestRespond(invite.value, token.value, a)
    if (data.value) data.value.response = a
    thanks.value = m.thanks[a]
  } catch {
    error.value = m.failed
  }
}
async function send() {
  if (!message.value.trim()) return
  error.value = ''
  try {
    await guestMessage(invite.value, token.value, message.value)
    message.value = ''
    messageSent.value = true
  } catch {
    error.value = m.failed
  }
}
async function stop() {
  try {
    await guestOptOut(invite.value, token.value)
    stopped.value = true
  } catch {
    error.value = m.failed
  }
}
function addToCalendar() {
  const d = data.value
  if (!d) return
  downloadIcs({ uid: invite.value, title: d.title, notes: d.notes, start_date: d.start_date, start_time: d.start_time, end_date: d.end_date, end_time: d.end_time, repeat: d.repeat, timezone: d.timezone, organizer: d.host_name })
}
const btn = (on: boolean) => ['min-h-12 flex-1 rounded-xl border px-4 text-lg font-semibold', on ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface']
</script>
