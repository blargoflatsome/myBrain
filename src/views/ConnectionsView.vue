<template>
  <main class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-28">
    <h1 class="text-2xl font-bold">{{ m.heading }}</h1>
    <p class="text-sm text-muted">{{ m.intro }}</p>
    <p v-if="!brain.online" class="rounded-xl bg-bg p-3 text-sm" role="status">{{ m.offline }}</p>

    <section :class="card" aria-labelledby="ask-heading">
      <h2 id="ask-heading" class="text-lg font-semibold">{{ m.askHeading }}</h2>
      <form class="flex flex-col gap-2" novalidate @submit.prevent="ask">
        <label class="flex flex-col gap-1 text-sm text-muted">
          {{ m.askLabel }}
          <input v-model="contact" :class="field" autocomplete="off" maxlength="320">
        </label>
        <button type="submit" class="min-h-11 self-start rounded-xl bg-accent px-4 font-semibold text-accent-ink" :disabled="!brain.online">{{ m.send }}</button>
      </form>
      <p v-if="askError" class="text-sm text-danger" role="alert" data-testid="ask-error">{{ askError }}</p>
      <p class="text-sm text-muted" role="status" data-testid="ask-status">{{ askStatus }}</p>
    </section>

    <section v-if="incoming.length" :class="card" aria-labelledby="incoming-heading">
      <h2 id="incoming-heading" class="text-lg font-semibold">{{ m.incomingHeading }}</h2>
      <ul class="flex flex-col gap-3">
        <li v-for="r in incoming" :key="r.id" class="flex flex-col gap-2" data-testid="incoming-request">
          <span class="flex min-w-0 items-center gap-2">
            <img v-if="r.avatar_url" :src="r.avatar_url" alt="" class="size-8 rounded-full" referrerpolicy="no-referrer">
            <span class="font-medium [overflow-wrap:anywhere]">{{ m.wantsToConnect(r.display_name) }}</span>
          </span>
          <span class="flex flex-wrap gap-2">
            <button type="button" class="min-h-11 rounded-xl bg-accent px-4 font-semibold text-accent-ink" @click="answer(r, 'accept')">{{ m.accept }}</button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-4" @click="answer(r, 'decline')">{{ m.decline }}</button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-4 text-danger" @click="answer(r, 'block')">{{ m.block }}</button>
          </span>
        </li>
      </ul>
    </section>

    <section :class="card" aria-labelledby="connections-heading">
      <h2 id="connections-heading" class="text-lg font-semibold">{{ m.connectionsHeading }}</h2>
      <p v-if="!connections.length" class="text-sm text-muted">{{ m.none }}</p>
      <ul v-else class="flex flex-col gap-2">
        <li v-for="c in connections" :key="c.friend_id" class="flex min-w-0 items-center justify-between gap-2" data-testid="connection">
          <span class="flex min-w-0 items-center gap-2">
            <img v-if="c.avatar_url" :src="c.avatar_url" alt="" class="size-8 rounded-full" referrerpolicy="no-referrer">
            <span class="font-medium [overflow-wrap:anywhere]">{{ c.display_name }}</span>
          </span>
          <span class="flex shrink-0 gap-1">
            <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm" :aria-label="m.removeLabel(c.display_name)" @click="askEnd(c, false)">{{ m.remove }}</button>
            <button type="button" class="min-h-11 rounded-xl border border-line px-3 text-sm text-danger" :aria-label="m.blockLabel(c.display_name)" @click="askEnd(c, true)">{{ m.block }}</button>
          </span>
        </li>
      </ul>
    </section>

    <section v-if="sent.length" :class="card" aria-labelledby="sent-heading">
      <h2 id="sent-heading" class="text-lg font-semibold">{{ m.sentHeading }}</h2>
      <ul class="flex flex-col gap-2">
        <li v-for="r in sent" :key="r.id" class="flex min-w-0 items-center justify-between gap-2" data-testid="sent-request">
          <span class="min-w-0 text-sm [overflow-wrap:anywhere]">{{ r.contact }} <span class="text-muted">· {{ m.sent }}</span></span>
          <button type="button" class="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm" :aria-label="m.cancelLabel(r.contact)" @click="cancel(r)">{{ m.cancel }}</button>
        </li>
      </ul>
    </section>

    <ConfirmDialog
      ref="confirmEnd"
      :heading="ending?.block ? m.confirmBlock.heading : m.confirmRemove.heading"
      :body="ending ? (ending.block ? m.confirmBlock.body : m.confirmRemove.body)(ending.c.display_name) : ''"
      :confirm-label="ending?.block ? m.block : m.remove"
      :keep-label="m.keep"
      @close="ending = null"
      @confirm="end"
    />
  </main>
</template>

<script setup lang="ts">
// SPEC §10 Connections, part 1: ask to connect by exact email or phone (the answer never says whether they have an
// account), answer requests (Accept, Decline, Block), see my connections and remove or block them.
import { onMounted, ref } from 'vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import {
  answerRequest,
  cancelRequest,
  incomingRequests,
  myConnections,
  removeConnection,
  requestConnection,
  sentRequests,
  type Connection,
  type IncomingRequest,
  type SentRequest,
} from '@/events/connections'
import { isEmail, isPhone } from '@/events/contacts'
import { messages } from '@/messages'
import { useBrainStore } from '@/stores/brain'
import { card, field } from '@/ui/styles'

const m = messages.connections
const brain = useBrainStore()
const incoming = ref<IncomingRequest[]>([])
const sent = ref<SentRequest[]>([])
const connections = ref<Connection[]>([])
async function load() {
  if (!brain.online) return
  ;[incoming.value, sent.value, connections.value] = await Promise.all([
    incomingRequests().catch(() => []),
    sentRequests().catch(() => []),
    myConnections().catch(() => []),
  ])
}
onMounted(load)

const contact = ref('')
const askError = ref('')
const askStatus = ref('')
async function ask() {
  askStatus.value = ''
  const typed = contact.value.trim()
  if (!isEmail(typed) && !isPhone(typed)) return (askError.value = m.askInvalid)
  askError.value = ''
  try {
    await requestConnection(typed)
    // The same answer whatever was typed: it never says whether they have an account.
    askStatus.value = m.askSent
    contact.value = ''
    await load()
  } catch (e) {
    askError.value = e instanceof Error ? e.message : String(e)
  }
}

async function answer(r: IncomingRequest, a: 'accept' | 'decline' | 'block') {
  await answerRequest(r.id, a)
  askStatus.value = a === 'accept' ? m.accepted(r.display_name) : ''
  await load()
}
async function cancel(r: SentRequest) {
  await cancelRequest(r.id)
  await load()
}

const confirmEnd = ref<InstanceType<typeof ConfirmDialog> | null>(null)
const ending = ref<{ c: Connection; block: boolean } | null>(null)
function askEnd(c: Connection, block: boolean) {
  ending.value = { c, block }
  confirmEnd.value?.open()
}
async function end() {
  if (ending.value) await removeConnection(ending.value.c.friend_id, ending.value.block)
  confirmEnd.value?.close()
  await load()
}
</script>
